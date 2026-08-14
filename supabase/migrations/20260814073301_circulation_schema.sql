-- T1: core circulation schema (items, loans, queue_entries, library_cards)
-- Scope per /plan-eng-review 2026-08-14 (Architecture Findings 1, 13, 16):
--   - item_id is a text key matching the string ids already used in
--     js/catalog-data.js, so this table only tracks copy count, not metadata.
--   - copies_total is the SOLE source of truth for availability (Finding 13);
--     the static `copies` field in catalog-data.js is display-only and must
--     never be read for enforcement.
--   - RLS is enabled with no policies yet (default-deny) so these tables are
--     never briefly wide-open. The actual policies (Finding 16: own-rows-only
--     for loans/queue_entries, counts-only public view) land in T3.
--   - RPC functions with row-locking (Finding 3, 4, 5) land in T2.

create table public.items (
  item_id text primary key,
  copies_total integer not null check (copies_total > 0),
  created_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.items (item_id),
  user_id uuid not null references auth.users (id),
  checked_out_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz
);

-- Partial index: fast lookup of "how many active loans does this item have"
-- (the count the T2 checkout function will compare against copies_total).
create index loans_item_active_idx on public.loans (item_id) where returned_at is null;
create index loans_user_idx on public.loans (user_id);

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.items (item_id),
  user_id uuid not null references auth.users (id),
  joined_at timestamptz not null default now(),
  unique (item_id, user_id)
);

create index queue_entries_item_idx on public.queue_entries (item_id, joined_at);

create table public.library_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  issued_by uuid references auth.users (id),
  claimed_by uuid references auth.users (id),
  issued_at timestamptz not null default now(),
  claimed_at timestamptz
);

-- A card can only ever be claimed once (Finding 5's concurrency guarantee
-- starts here; the redeem_card RPC in T2 adds the transactional check).
create unique index library_cards_claimed_by_unique
  on public.library_cards (claimed_by)
  where claimed_by is not null;

alter table public.items enable row level security;
alter table public.loans enable row level security;
alter table public.queue_entries enable row level security;
alter table public.library_cards enable row level security;
