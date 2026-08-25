-- T18: RLS enforcement for the dengonban corkboard redesign.
--
-- Verifies two things the corkboard redesign depends on: (1) opening
-- post_dengonban_message() to anonymous callers did NOT also open direct
-- table writes — dengonban_messages still has no insert/update/delete
-- policy for anon or authenticated, so every write still has to go
-- through the RPC's validation (color/position/doodle checks, rate
-- limiting); (2) check_anon_dengonban_rate_limit() actually throws once
-- its 3-per-10-minutes budget is exhausted, not just that the function
-- exists. Same technique as tests/e2e/rls-verification.sql (T16): switch
-- to the `anon`/`authenticated` roles with a real request.jwt.claims
-- context, since the SQL Editor's default `postgres` superuser connection
-- bypasses RLS entirely and would "pass" regardless of whether RLS is
-- actually wired up.
--
-- Self-contained — one script, one tab, no manual coordination needed.
-- Run it, read the results table, then it cleans up its own test rows.

drop table if exists t18_rls_results;
create table t18_rls_results (check_name text, ok boolean, detail text);
grant select, insert on t18_rls_results to authenticated, anon;

do $$
declare
  v_user_a uuid := (select id from auth.users limit 1);
  v_marker_id uuid;
  v_test_token uuid := gen_random_uuid();
  v_row_count int;
  v_rows_affected int;
  v_raised boolean;
  i int;
begin
  -- ---------------------------------------------------------------
  -- Direct writes against dengonban_messages must still be rejected
  -- for both anon and authenticated — the RPC is the only write path.
  --
  -- INSERT and UPDATE/DELETE fail differently under RLS with no
  -- matching policy: INSERT's WITH CHECK genuinely rejects the new row
  -- and raises insufficient_privilege, but UPDATE/DELETE's USING clause
  -- just makes existing rows invisible to the command — it silently
  -- matches zero rows, no exception. Checking "did it raise" for
  -- UPDATE/DELETE the same way as INSERT would misreport a real 0-row
  -- block as a failure (confirmed by hand against this exact project
  -- during T18: rows_affected was 0 and the row was untouched, despite
  -- no exception) — GET DIAGNOSTICS ROW_COUNT is the correct check.
  -- ---------------------------------------------------------------
  execute 'set local role anon';
  v_raised := false;
  begin
    insert into dengonban_messages (body, color, pos_x, pos_y) values ('t18 direct insert', '#fef3c7', 50, 50);
  exception
    when insufficient_privilege then v_raised := true;
  end;
  insert into t18_rls_results values ('anon cannot directly insert into dengonban_messages', v_raised, format('insert blocked: %s', v_raised));
  reset role;

  if v_user_a is not null then
    -- A real marker row (inserted as postgres, bypassing RLS — this is
    -- setup, not the thing under test) so the update/delete checks have
    -- something that actually exists to fail to touch.
    insert into dengonban_messages (user_id, body, color, pos_x, pos_y, hidden)
    values (v_user_a, 't18 direct write marker', '#fef3c7', 50, 50, false)
    returning id into v_marker_id;

    perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_raised := false;
    begin
      insert into dengonban_messages (user_id, body, color, pos_x, pos_y) values (v_user_a, 't18 direct insert', '#fef3c7', 50, 50);
    exception
      when insufficient_privilege then v_raised := true;
    end;
    insert into t18_rls_results values ('authenticated cannot directly insert into dengonban_messages', v_raised, format('insert blocked: %s', v_raised));

    update dengonban_messages set hidden = true where id = v_marker_id;
    get diagnostics v_rows_affected = row_count;
    insert into t18_rls_results values ('authenticated cannot directly update dengonban_messages', v_rows_affected = 0, format('rows affected: %s (expected 0)', v_rows_affected));

    delete from dengonban_messages where id = v_marker_id;
    get diagnostics v_rows_affected = row_count;
    insert into t18_rls_results values ('authenticated cannot directly delete from dengonban_messages', v_rows_affected = 0, format('rows affected: %s (expected 0)', v_rows_affected));
    reset role;

    delete from dengonban_messages where id = v_marker_id; -- cleanup as postgres, in case the blocked delete above somehow left it
  else
    insert into t18_rls_results values ('authenticated write checks', false, 'no auth.users row found — cannot test');
  end if;

  -- ---------------------------------------------------------------
  -- check_anon_dengonban_rate_limit(): 3 calls succeed, the 4th raises.
  -- Runs as anon, matching how post_dengonban_message actually calls it.
  --
  -- The row-count verification runs AFTER `reset role` (as postgres) —
  -- dengonban_anon_rate_limit has zero RLS policies, so a SELECT against
  -- it as anon/authenticated sees nothing regardless of what the
  -- security-definer function inserted, and would misreport a working
  -- rate limiter as broken.
  -- ---------------------------------------------------------------
  execute 'set local role anon';

  for i in 1..3 loop
    perform public.check_anon_dengonban_rate_limit(v_test_token);
  end loop;

  reset role;
  select count(*) into v_row_count from dengonban_anon_rate_limit where anon_token = v_test_token;
  insert into t18_rls_results values ('3 calls under the anon rate limit all succeed', v_row_count = 3, format('rows logged: %s (expected 3)', v_row_count));

  execute 'set local role anon';
  v_raised := false;
  begin
    perform public.check_anon_dengonban_rate_limit(v_test_token);
  exception
    when others then
      if position('rate limit exceeded for anonymous posting' in sqlerrm) > 0 then
        v_raised := true;
      end if;
  end;
  insert into t18_rls_results values ('a 4th call within the window raises the anon rate limit', v_raised, format('raised as expected: %s', v_raised));

  reset role;

  -- Cleanup: only this script's own test rows, by the token/marker it created.
  delete from dengonban_anon_rate_limit where anon_token = v_test_token;
  delete from dengonban_messages where body in ('t18 direct insert', 't18 direct write marker');
end $$;

select * from t18_rls_results order by check_name;
