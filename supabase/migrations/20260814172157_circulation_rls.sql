-- T3: RLS policies (Finding 16). Every table already has RLS enabled with
-- zero policies (T1), i.e. currently NOTHING is readable at all — including
-- items.copies_total, which the catalog page needs just to show "1 copy in
-- the collection". This migration opens exactly the doors Finding 16 calls
-- for, no wider:
--   - items: public read (capacity numbers aren't sensitive — the current
--     site already shows this in catalog-data.js's static display copy).
--   - item_availability (new view): public read of AGGREGATE counts only
--     (active loans, queue length) — never which specific member holds
--     what. This is what the T7 batch catalog-status query will read from.
--   - loans / queue_entries: read-only, own-rows-only (user_id = auth.uid()).
--     No INSERT/UPDATE/DELETE policies at all for any role — all writes to
--     these tables happen exclusively through the T2 RPC functions
--     (security definer, bypasses RLS by design), never direct table access.
--   - library_cards: read-only, a card you issued OR the card you claimed
--     to join. Needed for the membership.html "your cards" dashboard (T9)
--     to function — a direct extension of the same own-rows principle
--     Finding 16 established for loans/queue_entries, not a new decision.
--
-- Admin bypass policies are intentionally NOT included here — the admin
-- role (T4) doesn't exist yet. Adding admin-specific RLS comes with T4/T11.

-- ---------------------------------------------------------------------
-- items: public read. Writes happen via direct admin table access later
-- (T11), not via RLS policy — no write policy added here.
-- ---------------------------------------------------------------------
create policy "items are publicly readable"
  on public.items
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- item_availability: aggregate-only public view. Joins items with live
-- counts of active loans and queue length — no user_id ever exposed.
-- security_invoker so it respects the RLS policies above/below rather
-- than running with the view creator's privileges.
-- ---------------------------------------------------------------------
create view public.item_availability
  with (security_invoker = true)
  as
  select
    i.item_id,
    i.copies_total,
    count(distinct l.id) filter (where l.returned_at is null) as active_loans,
    count(distinct q.id) as queue_length
  from public.items i
  left join public.loans l on l.item_id = i.item_id
  left join public.queue_entries q on q.item_id = i.item_id
  group by i.item_id, i.copies_total;

grant select on public.item_availability to anon, authenticated;

-- ---------------------------------------------------------------------
-- loans: read-only, own rows only. No write policies — check_out and
-- return_item (T2, security definer) are the only write path.
-- ---------------------------------------------------------------------
create policy "users read their own loans"
  on public.loans
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- queue_entries: same pattern as loans.
-- ---------------------------------------------------------------------
create policy "users read their own queue entries"
  on public.queue_entries
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- library_cards: read a card you issued, or the card you used to join.
-- Looking up an arbitrary code's validity goes through validate_card_code
-- (T2, security definer) instead — this policy never needs to expose
-- other members' codes.
-- ---------------------------------------------------------------------
create policy "users read their own issued or claimed cards"
  on public.library_cards
  for select
  to authenticated
  using (issued_by = auth.uid() or claimed_by = auth.uid());
