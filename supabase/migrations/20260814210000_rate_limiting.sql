-- T14: per-user rate limiting on the member-facing write RPCs (TODO 3).
-- Admin RPCs (admin_issue_card, admin_force_return, admin_set_banned,
-- admin_upsert_item) are deliberately left alone — they're already
-- gated behind is_admin() to a tiny trusted set, so the abuse surface
-- rate-limiting is meant to close doesn't apply there.
--
-- check_rate_limit() is called as the first thing after each function's
-- existing "must be authenticated" check, so it also throttles repeated
-- calls from banned/overdue callers, not just ones that would otherwise
-- succeed — the point is stopping someone from hammering the endpoint,
-- regardless of whether any individual call would have gone through.

create table public.rate_limit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id),
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_log_lookup_idx on public.rate_limit_log (user_id, action, created_at);

alter table public.rate_limit_log enable row level security;
-- No policies: never read or written directly by clients, only through
-- check_rate_limit() (security definer), same as every other write path.

create or replace function public.check_rate_limit(p_action text, p_max_calls int, p_window_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count int;
begin
  select count(*) into v_recent_count
  from public.rate_limit_log
  where user_id = auth.uid()
    and action = p_action
    and created_at > now() - (p_window_seconds || ' seconds')::interval;

  if v_recent_count >= p_max_calls then
    raise exception 'rate limit exceeded for %, try again shortly', p_action;
  end if;

  insert into public.rate_limit_log (user_id, action) values (auth.uid(), p_action);
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- check_out / return_item / join_queue / leave_queue: 20 calls per
-- 5-minute window each. Generous enough for real use (checking several
-- items in one session), tight enough to block spam.
-- ---------------------------------------------------------------------
create or replace function public.check_out(p_item_id text)
returns public.loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copies int;
  v_active int;
  v_overdue int;
  v_banned boolean;
  v_loan public.loans;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to check out an item';
  end if;

  perform public.check_rate_limit('check_out', 20, 300);

  select banned into v_banned from public.profiles where user_id = auth.uid();
  if coalesce(v_banned, false) then
    raise exception 'this account has been suspended from checking out items';
  end if;

  select count(*) into v_overdue
  from public.loans
  where user_id = auth.uid() and returned_at is null and due_at < now();

  if v_overdue > 0 then
    raise exception 'you have an overdue item — return it before checking out another';
  end if;

  select copies_total into v_copies
  from public.items
  where item_id = p_item_id
  for update;

  if v_copies is null then
    raise exception 'unknown item %', p_item_id;
  end if;

  select count(*) into v_active
  from public.loans
  where item_id = p_item_id and returned_at is null;

  if v_active >= v_copies then
    raise exception 'no copies available';
  end if;

  insert into public.loans (item_id, user_id, due_at)
  values (p_item_id, auth.uid(), now() + interval '14 days')
  returning * into v_loan;

  return v_loan;
end;
$$;

create or replace function public.return_item(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id text;
  v_next_user uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to return an item';
  end if;

  perform public.check_rate_limit('return_item', 20, 300);

  update public.loans
    set returned_at = now()
    where id = p_loan_id
      and user_id = auth.uid()
      and returned_at is null
    returning item_id into v_item_id;

  if not found then
    raise exception 'loan not found, not yours, or already returned';
  end if;

  select user_id into v_next_user
  from public.queue_entries
  where item_id = v_item_id
  order by joined_at asc
  limit 1;

  if v_next_user is not null then
    insert into public.notifications (user_id, item_id) values (v_next_user, v_item_id);
  end if;
end;
$$;

create or replace function public.join_queue(p_item_id text)
returns public.queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_banned boolean;
  v_entry public.queue_entries;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to join a queue';
  end if;

  perform public.check_rate_limit('join_queue', 20, 300);

  select banned into v_banned from public.profiles where user_id = auth.uid();
  if coalesce(v_banned, false) then
    raise exception 'this account has been suspended from joining queues';
  end if;

  insert into public.queue_entries (item_id, user_id)
  values (p_item_id, auth.uid())
  returning * into v_entry;

  return v_entry;
exception
  when unique_violation then
    raise exception 'already in queue for this item';
end;
$$;

create or replace function public.leave_queue(p_item_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to leave a queue';
  end if;

  perform public.check_rate_limit('leave_queue', 20, 300);

  delete from public.queue_entries
  where item_id = p_item_id and user_id = auth.uid();

  if not found then
    raise exception 'not in queue for this item';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- redeem_card: tighter limit (5 per 10 minutes) — the most sensitive
-- write RPC, since it takes a code as input. 128 bits of entropy already
-- makes brute-forcing computationally infeasible regardless, but this
-- is cheap defense-in-depth on top of that, not a substitute for it.
-- ---------------------------------------------------------------------
create or replace function public.redeem_card(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  i int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to redeem a card';
  end if;

  perform public.check_rate_limit('redeem_card', 5, 600);

  update public.library_cards
    set claimed_by = auth.uid(), claimed_at = now()
    where code = p_code and claimed_by is null
    returning id into v_card_id;

  if v_card_id is null then
    raise exception 'card code invalid or already claimed';
  end if;

  for i in 1..5 loop
    insert into public.library_cards (code, issued_by)
    values (public.generate_card_code(), auth.uid());
  end loop;
end;
$$;
