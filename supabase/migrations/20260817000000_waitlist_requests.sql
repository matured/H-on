-- The membership.html waitlist form ("We keep a short waitlist for people
-- without a member connection") previously just toggled a hardcoded
-- "demo form" message on submit with no backend call at all. This adds a
-- real table for it so requests are actually captured ahead of launch.
--
-- Write-only from the client, same shape as rate_limit_log: no select/
-- update/delete policy, so nobody can read back or tamper with other
-- people's submissions through the anon key. Reading the list back is an
-- admin concern for later (e.g. a future admin_list_waitlist RPC), not
-- needed to make the form itself honest.

create table public.waitlist_requests (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.waitlist_requests enable row level security;

create policy "anyone can submit a waitlist request"
  on public.waitlist_requests
  for insert
  to anon, authenticated
  with check (true);
