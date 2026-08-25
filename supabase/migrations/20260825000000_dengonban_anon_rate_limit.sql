-- Corkboard redesign (T18): rate limiting for anonymous dengonban posters.
--
-- check_rate_limit() (T14) is keyed entirely on auth.uid() and cannot be
-- called for an anonymous poster — there is no account to key on. This is
-- a separate, additive mechanism: a client-generated uuid persisted in
-- localStorage (see honGetOrCreateAnonToken in js/circulation.js), passed
-- explicitly as p_anon_token. It resets if someone clears storage or uses
-- incognito — an accepted, proportionate deterrent for a personal project,
-- not a hard barrier. The existing per-member limit is untouched.
--
-- This table deliberately does NOT live as columns on dengonban_messages:
-- that table's only RLS policy is row-level (select ... using (not hidden
-- and expires_at > now())), not column-level, and honFetchDengonban()'s
-- narrow .select('id, body, ...') doesn't stop a client from calling
-- .select('*') directly against PostgREST. An anon-identity column there
-- would let any visitor read every other anon poster's token straight
-- through the public API. Keeping it in its own zero-policy table (same
-- posture as rate_limit_log) means it's reachable only through
-- check_anon_dengonban_rate_limit() below.

create table public.dengonban_anon_rate_limit (
  id bigint generated always as identity primary key,
  anon_token uuid not null,
  created_at timestamptz not null default now()
);

create index dengonban_anon_rate_limit_token_idx on public.dengonban_anon_rate_limit (anon_token, created_at);
create index dengonban_anon_rate_limit_created_idx on public.dengonban_anon_rate_limit (created_at);

alter table public.dengonban_anon_rate_limit enable row level security;
-- No policies: never read or written directly by clients, only through
-- check_anon_dengonban_rate_limit() (security definer), same as
-- rate_limit_log.

-- 3 posts per 10 minutes per token — tighter than the signed-in member
-- limit (5 per 10 minutes) since a localStorage token is weaker identity
-- than an authenticated account.
create or replace function public.check_anon_dengonban_rate_limit(p_anon_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count int;
begin
  if p_anon_token is null then
    raise exception 'missing anon token';
  end if;

  -- Global prune (no anon_token filter, unlike check_rate_limit's
  -- per-user prune) since anon_token isn't a stable per-caller partition
  -- the way user_id is — bounded by the created_at index, and nothing it
  -- deletes is ever inside the 600s window checked below.
  delete from public.dengonban_anon_rate_limit where created_at < now() - interval '1 hour';

  select count(*) into v_recent_count
  from public.dengonban_anon_rate_limit
  where anon_token = p_anon_token and created_at > now() - interval '600 seconds';

  if v_recent_count >= 3 then
    raise exception 'rate limit exceeded for anonymous posting, try again shortly';
  end if;

  insert into public.dengonban_anon_rate_limit (anon_token) values (p_anon_token);
end;
$$;

revoke execute on function public.check_anon_dengonban_rate_limit(uuid) from public;
grant execute on function public.check_anon_dengonban_rate_limit(uuid) to anon, authenticated;
