-- T16, part 2 of 2: RLS enforcement.
--
-- Verifies Architecture Finding 16's actual point — that loans,
-- queue_entries, and library_cards are genuinely private per-user, as
-- enforced by RLS policy, not just "private because the UI doesn't show
-- them." The SQL Editor's default connection is the `postgres`
-- superuser, which bypasses RLS entirely — running a plain SELECT there
-- would "pass" regardless of whether RLS is actually wired up, so this
-- script explicitly switches to the `authenticated` and `anon` roles
-- (with a real request.jwt.claims context) to exercise RLS as it's
-- actually enforced for real API callers, the same technique already
-- used to verify T3's and T14's work.
--
-- Self-contained — one script, one tab, no manual coordination needed.
-- Run it, read the results table, then it cleans up its own test rows.

drop table if exists t16_rls_results;
create table t16_rls_results (check_name text, ok boolean, detail text);
grant select, insert on t16_rls_results to authenticated, anon;

do $$
declare
  v_user_a uuid := (select id from auth.users limit 1);
  v_fake_user_b uuid := gen_random_uuid(); -- a read-only RLS check doesn't need this to be a real row
  v_loan_id uuid;
  v_card_id uuid;
  v_visible_count int;
begin
  if v_user_a is null then
    insert into t16_rls_results values ('setup', false, 'no auth.users row found — cannot test');
    return;
  end if;

  insert into items (item_id, copies_total, title, issue, era, genre, call_number, cover_bg, cover_fg, cover_accent, description)
  values ('t16-rls-test', 5, 'RLS Test', 'No.1', '2026', 'Test', '本 · T16 · 002', '#000000', '#ffffff', '#ff0000', 'RLS test item, safe to delete')
  on conflict (item_id) do update set copies_total = 5;

  insert into loans (item_id, user_id, due_at)
  values ('t16-rls-test', v_user_a, now() + interval '14 days')
  returning id into v_loan_id;

  insert into queue_entries (item_id, user_id) values ('t16-rls-test', v_user_a);

  insert into library_cards (code, issued_by)
  values (public.generate_card_code(), v_user_a)
  returning id into v_card_id;

  -- As the owning user: should see all three of their own rows.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_visible_count from loans where id = v_loan_id;
  insert into t16_rls_results values ('owner sees their own loan', v_visible_count = 1, format('visible rows: %s', v_visible_count));

  select count(*) into v_visible_count from queue_entries where item_id = 't16-rls-test' and user_id = v_user_a;
  insert into t16_rls_results values ('owner sees their own queue entry', v_visible_count = 1, format('visible rows: %s', v_visible_count));

  select count(*) into v_visible_count from library_cards where id = v_card_id;
  insert into t16_rls_results values ('owner sees their own issued card', v_visible_count = 1, format('visible rows: %s', v_visible_count));

  reset role;

  -- As a different authenticated user: should see none of it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_fake_user_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_visible_count from loans where id = v_loan_id;
  insert into t16_rls_results values ('different user cannot see the loan', v_visible_count = 0, format('visible rows: %s (should be 0)', v_visible_count));

  select count(*) into v_visible_count from queue_entries where item_id = 't16-rls-test' and user_id = v_user_a;
  insert into t16_rls_results values ('different user cannot see the queue entry', v_visible_count = 0, format('visible rows: %s (should be 0)', v_visible_count));

  select count(*) into v_visible_count from library_cards where id = v_card_id;
  insert into t16_rls_results values ('different user cannot see the issued card', v_visible_count = 0, format('visible rows: %s (should be 0)', v_visible_count));

  reset role;

  -- As anon (signed out entirely): should see none of it either — there
  -- is no anon SELECT policy on any of these three tables.
  execute 'set local role anon';

  select count(*) into v_visible_count from loans where id = v_loan_id;
  insert into t16_rls_results values ('anon cannot see the loan', v_visible_count = 0, format('visible rows: %s (should be 0)', v_visible_count));

  select count(*) into v_visible_count from queue_entries where item_id = 't16-rls-test' and user_id = v_user_a;
  insert into t16_rls_results values ('anon cannot see the queue entry', v_visible_count = 0, format('visible rows: %s (should be 0)', v_visible_count));

  select count(*) into v_visible_count from library_cards where id = v_card_id;
  insert into t16_rls_results values ('anon cannot see the issued card', v_visible_count = 0, format('visible rows: %s (should be 0)', v_visible_count));

  reset role;

  -- Cleanup: only the specific rows this script created, by id — never
  -- a broad time-window delete that could catch something real.
  delete from queue_entries where item_id = 't16-rls-test' and user_id = v_user_a;
  delete from loans where id = v_loan_id;
  delete from library_cards where id = v_card_id;
  delete from items where item_id = 't16-rls-test';
end $$;

select * from t16_rls_results order by check_name;
