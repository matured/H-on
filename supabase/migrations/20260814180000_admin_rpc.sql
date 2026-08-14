-- T11: admin capabilities (issue cards, force-return loans, ban/unban
-- members) — the "full build" half of Finding 14; T4 already handled
-- bootstrapping the founder's own admin flag + first 5 cards by hand.
--
-- Every admin action here goes through a SECURITY DEFINER RPC that checks
-- is_admin() internally, matching the pattern already established for
-- every other write in this schema (T2) — extended here to admin READS
-- too, which avoids writing a recursive "if admin" USING clause directly
-- on profiles/loans/library_cards. No new RLS policies are added.

alter table public.profiles add column banned boolean not null default false;

-- ---------------------------------------------------------------------
-- is_admin: the single place every admin RPC below checks.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- admin_list_profiles: every member, with their email pulled from
-- auth.users (not otherwise exposed to the client — PostgREST never
-- sees the auth schema directly).
-- ---------------------------------------------------------------------
create or replace function public.admin_list_profiles()
returns table (
  user_id uuid,
  email text,
  is_admin boolean,
  banned boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select p.user_id, u.email, p.is_admin, p.banned, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    order by p.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_list_loans: every active (not yet returned) loan, with the
-- holder's email. item_id only, not a title — catalog metadata still
-- lives in js/catalog-data.js until T12.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_loans()
returns table (
  loan_id uuid,
  item_id text,
  user_email text,
  checked_out_at timestamptz,
  due_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select l.id, l.item_id, u.email, l.checked_out_at, l.due_at
    from public.loans l
    join auth.users u on u.id = l.user_id
    where l.returned_at is null
    order by l.due_at asc;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_force_return: same effect as return_item, minus the
-- user_id = auth.uid() restriction — an admin can close out any loan
-- (lost item, member no longer participating, etc.).
-- ---------------------------------------------------------------------
create or replace function public.admin_force_return(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.loans
    set returned_at = now()
    where id = p_loan_id and returned_at is null;

  if not found then
    raise exception 'loan not found or already returned';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_issue_card: mint one extra card, attributed to the admin who
-- issued it (it shows up on their own membership.html dashboard like
-- any other card they can hand out).
-- ---------------------------------------------------------------------
create or replace function public.admin_issue_card()
returns public.library_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.library_cards;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  insert into public.library_cards (code, issued_by)
  values (public.generate_card_code(), auth.uid())
  returning * into v_card;

  return v_card;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_set_banned: toggle a member's banned flag. Banning blocks new
-- checkouts and queue joins (see check_out/join_queue below) — it does
-- NOT block returning items already held, and doesn't touch existing
-- loans retroactively.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.profiles set banned = p_banned where user_id = p_user_id;

  if not found then
    raise exception 'no profile for that user';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Extend check_out and join_queue with a banned check, same shape as
-- check_out's existing overdue check (T8).
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

  -- Row lock: a second concurrent call for the same item_id blocks here
  -- until this transaction commits or rolls back, then re-reads the
  -- now-current active loan count.
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

-- ---------------------------------------------------------------------
-- Grants: admin RPCs need an authenticated caller (is_admin() denies
-- non-admins internally either way, but no reason to expose them to
-- anon at the Postgres grant level too).
-- ---------------------------------------------------------------------
revoke execute on function public.is_admin() from public;
revoke execute on function public.admin_list_profiles() from public;
revoke execute on function public.admin_list_loans() from public;
revoke execute on function public.admin_force_return(uuid) from public;
revoke execute on function public.admin_issue_card() from public;
revoke execute on function public.admin_set_banned(uuid, boolean) from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_profiles() to authenticated;
grant execute on function public.admin_list_loans() to authenticated;
grant execute on function public.admin_force_return(uuid) to authenticated;
grant execute on function public.admin_issue_card() to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;
