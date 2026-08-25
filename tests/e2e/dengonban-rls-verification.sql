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
  v_test_token uuid := gen_random_uuid();
  v_row_count int;
  v_raised boolean;
  i int;
begin
  -- ---------------------------------------------------------------
  -- Direct writes against dengonban_messages must still be rejected
  -- for both anon and authenticated — the RPC is the only write path.
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
    perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_raised := false;
    begin
      insert into dengonban_messages (user_id, body, color, pos_x, pos_y) values (v_user_a, 't18 direct insert', '#fef3c7', 50, 50);
    exception
      when insufficient_privilege then v_raised := true;
    end;
    insert into t18_rls_results values ('authenticated cannot directly insert into dengonban_messages', v_raised, format('insert blocked: %s', v_raised));

    v_raised := false;
    begin
      update dengonban_messages set hidden = true where user_id = v_user_a;
    exception
      when insufficient_privilege then v_raised := true;
    end;
    insert into t18_rls_results values ('authenticated cannot directly update dengonban_messages', v_raised, format('update blocked: %s', v_raised));

    v_raised := false;
    begin
      delete from dengonban_messages where user_id = v_user_a;
    exception
      when insufficient_privilege then v_raised := true;
    end;
    insert into t18_rls_results values ('authenticated cannot directly delete from dengonban_messages', v_raised, format('delete blocked: %s', v_raised));
    reset role;
  else
    insert into t18_rls_results values ('authenticated write checks', false, 'no auth.users row found — cannot test');
  end if;

  -- ---------------------------------------------------------------
  -- check_anon_dengonban_rate_limit(): 3 calls succeed, the 4th raises.
  -- Runs as anon, matching how post_dengonban_message actually calls it.
  -- ---------------------------------------------------------------
  execute 'set local role anon';

  for i in 1..3 loop
    perform public.check_anon_dengonban_rate_limit(v_test_token);
  end loop;

  select count(*) into v_row_count from dengonban_anon_rate_limit where anon_token = v_test_token;
  insert into t18_rls_results values ('3 calls under the anon rate limit all succeed', v_row_count = 3, format('rows logged: %s (expected 3)', v_row_count));

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
  delete from dengonban_messages where body = 't18 direct insert';
end $$;

select * from t18_rls_results order by check_name;
