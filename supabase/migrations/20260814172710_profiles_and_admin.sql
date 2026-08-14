-- T4: profiles table + admin flag + auto-provisioning trigger.
-- Scope per /plan-eng-review 2026-08-14 (Architecture Finding 14, "let's do
-- both"): this migration is the schema half — a profiles table with
-- is_admin, auto-created for every new auth.users row via trigger, plus
-- RLS so a user can read (only) their own profile.
--
-- The OTHER half of Finding 14 — actually seeding the founder's account as
-- admin and minting their first 5 cards — deliberately does NOT live in
-- this file. That's one-time data tied to a specific real person's UUID,
-- not schema; hardcoding it into a versioned migration would put personal
-- identifying data into git history for no reason. It's a one-off SQL
-- Editor script instead, same pattern as the T2/T3 verification scripts.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users read their own profile"
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

-- Auto-provision a profile row (is_admin defaults to false) whenever a new
-- user completes signup, so profiles never drift out of sync with
-- auth.users and the app never has to handle "profile doesn't exist yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
