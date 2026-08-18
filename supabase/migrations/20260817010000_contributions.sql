-- Real payment tracking for support.html's "Become a Supporter" flow, which
-- previously never processed anything (a JS-only "demo confirmation").
-- Rows are written exclusively by the create-checkout-session and
-- stripe-webhook Edge Functions using the service role key, never by a
-- client directly, so there are no anon/authenticated RLS policies at all
-- (same write-only-via-server-role posture as rate_limit_log).

create table public.contributions (
  id bigint generated always as identity primary key,
  stripe_session_id text not null unique,
  stripe_customer_email text,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'complete', 'expired')),
  user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index contributions_status_idx on public.contributions (status);

alter table public.contributions enable row level security;
-- No policies: only the service role (Edge Functions) reads or writes this
-- table. A future "your contributions" dashboard would add an own-rows
-- select policy keyed on user_id — not needed for the donate flow itself.
