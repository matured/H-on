-- T16, part 1 of 2: checkout race condition.
--
-- Verifies Architecture Finding 3's actual point — that check_out's
-- `SELECT ... FOR UPDATE` row lock genuinely serializes two concurrent
-- attempts to check out the last available copy of an item, so exactly
-- one succeeds. This isn't runnable by a single script alone (a single
-- SQL Editor session can't be in two places "at once" — real
-- concurrency needs two separate sessions), so it's split into two
-- parts you run in two separate SQL Editor tabs:
--
--   1. Open a new SQL Editor tab (Tab A). Paste and run the PART A
--      block below. It checks out a throwaway 1-copy test item, then
--      holds that transaction open with pg_sleep(25) — deliberately
--      giving you a 25-second window.
--   2. WHILE Tab A is still showing "running" (inside its 25-second
--      sleep), open a second SQL Editor tab (Tab B), paste the PART B
--      block, and run it.
--   3. Expected result: Tab A finishes and reports success. Tab B's
--      query BLOCKS (shows "running") until Tab A commits, then
--      immediately fails with "no copies available" — proof the lock
--      correctly serialized the two attempts rather than letting both
--      succeed (which would be the double-checkout bug this whole
--      system exists to prevent).
--   4. Run the CLEANUP block (either tab) once both have finished.
--
-- This calls the real public.check_out() RPC directly — not a
-- hand-copied reimplementation of its logic — so it's testing the
-- actual deployed function, not a stand-in for it.
--
-- Honest caveat from actually running this (2026-08-14): manual
-- two-tab timing in a UI is genuinely hard to pin down — you can
-- confirm check_out correctly refuses a second checkout once capacity
-- is exhausted (Part B fails with "no copies available"), but it's
-- hard to be fully certain from the UI alone whether that rejection
-- came from genuinely blocking on Part A's open lock vs. simply
-- running after Part A had already committed. The row lock itself was
-- already fully proven once before, in T2's original verification (a
-- single deterministic script, no manual timing involved) — treat
-- that as the primary proof of Finding 3, and this as a secondary,
-- real-RPC confirmation of the same capacity-enforcement behavior
-- rather than independent proof of the blocking mechanics.

-- =====================================================================
-- PART A — run this first, in Tab A.
-- =====================================================================

insert into items (item_id, copies_total, title, issue, era, genre, call_number, cover_bg, cover_fg, cover_accent, description)
values ('t16-race-test', 1, 'Race Test', 'No.1', '2026', 'Test', '本 · T16 · 001', '#000000', '#ffffff', '#ff0000', 'race condition test item, safe to delete')
on conflict (item_id) do update set copies_total = 1;

begin;

select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select public.check_out('t16-race-test');

-- Holds the row lock open for 25 seconds — switch to Tab B now and run
-- PART B while this is still "running".
select pg_sleep(25);

commit;

select 'Session A: checked out successfully, transaction committed.' as result;

-- =====================================================================
-- PART B — run this in a SECOND tab, WHILE Part A is still sleeping.
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

-- This blocks until Part A's transaction commits (same row lock), then
-- should fail with "no copies available" — that failure IS the pass
-- condition. If this instead succeeds, the race condition is real and
-- unfixed.
select public.check_out('t16-race-test');

-- =====================================================================
-- CLEANUP — run once, after both A and B have finished.
-- =====================================================================

delete from loans where item_id = 't16-race-test';
delete from items where item_id = 't16-race-test';
