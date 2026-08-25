-- T17: community message board (伝言板 / dengonban) — TODOS.md "Features".
--
-- Public read (anyone can see the board, like a real station chalkboard),
-- member-only write (auth.uid() required, same posture as check_out/
-- join_queue), rate-limited via the existing check_rate_limit() from T14 —
-- no new infra needed since posting requires auth, unlike the waitlist
-- form's anon insert.
--
-- Messages auto-expire (expires_at, default +30 days): real dengonban
-- boards are physically erased over time, not an infinite log — this
-- mechanic is load-bearing for the feature matching the site's ephemeral
-- physical-media premise, not an afterthought.

create table public.dengonban_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  hidden boolean not null default false
);

-- Partial index on the predicate the public read policy (and honFetchDengonban's
-- ORDER BY created_at) actually uses. expires_at can't be folded into the
-- index predicate (not immutable), so that half is filtered at query time.
create index dengonban_messages_visible_idx
  on public.dengonban_messages (created_at desc)
  where not hidden;

alter table public.dengonban_messages enable row level security;

-- Public read of non-hidden, non-expired messages only — same "safe
-- subset, not raw table" posture as item_availability (T3). No select
-- policy exposes hidden/expired rows to anyone but admins, who read
-- everything through admin_hide_dengonban_message's is_admin() gate below
-- (moderation needs to see what it's hiding, same as admin_list_waitlist).
create policy "dengonban messages are publicly readable"
  on public.dengonban_messages
  for select
  to anon, authenticated
  using (not hidden and expires_at > now());

-- No insert/update/delete policy — same as every other write path in this
-- schema (T2), all writes go through the security definer RPCs below.

-- ---------------------------------------------------------------------
-- post_dengonban_message: 5 per 10 minutes — tighter than check_out/
-- join_queue's 20-per-5-minutes (T14), since this is the first genuinely
-- public-write surface a banned/hostile account could hammer with content
-- other members actually see, not just a personal circulation action.
-- ---------------------------------------------------------------------
create or replace function public.post_dengonban_message(p_body text)
returns public.dengonban_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_banned boolean;
  v_body text;
  v_msg public.dengonban_messages;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to post';
  end if;

  select banned into v_banned from public.profiles where user_id = auth.uid();
  if coalesce(v_banned, false) then
    raise exception 'this account has been suspended from posting';
  end if;

  perform public.check_rate_limit('post_dengonban_message', 5, 600);

  v_body := trim(p_body);
  if char_length(v_body) < 1 then
    raise exception 'message cannot be empty';
  end if;

  insert into public.dengonban_messages (user_id, body)
  values (auth.uid(), v_body)
  returning * into v_msg;

  return v_msg;
end;
$$;

revoke execute on function public.post_dengonban_message(text) from public;
grant execute on function public.post_dengonban_message(text) to authenticated;

-- ---------------------------------------------------------------------
-- admin_hide_dengonban_message: same is_admin()-gated shape as
-- admin_force_return (T11) — flips hidden rather than deleting, so the
-- row (and its abuse history, if a pattern of accounts needs banning)
-- isn't lost.
-- ---------------------------------------------------------------------
create or replace function public.admin_hide_dengonban_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.dengonban_messages set hidden = true where id = p_id;

  if not found then
    raise exception 'message not found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_list_dengonban: everything (including hidden/expired), newest
-- first, for the admin.html moderation panel — same capped-at-500 stopgap
-- as admin_list_waitlist (T-2026-08-21) since this table has the same
-- "no rate limit on reads, only on the post RPC" shape.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_dengonban()
returns table (
  id uuid,
  user_email text,
  body text,
  created_at timestamptz,
  expires_at timestamptz,
  hidden boolean
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
    select m.id, u.email, m.body, m.created_at, m.expires_at, m.hidden
    from public.dengonban_messages m
    join auth.users u on u.id = m.user_id
    order by m.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.admin_hide_dengonban_message(uuid) from public;
revoke execute on function public.admin_list_dengonban() from public;
grant execute on function public.admin_hide_dengonban_message(uuid) to authenticated;
grant execute on function public.admin_list_dengonban() to authenticated;
