-- T2: transactional RPC functions (check_out, return_item, join_queue,
-- leave_queue, validate_card_code, redeem_card).
-- Scope per /plan-eng-review 2026-08-14 (Architecture Findings 3, 4, 5, 17;
-- Test Review Critical Gap 1; Finding 15 satisfied inline for code entropy).
--
-- Two different concurrency patterns are used deliberately, not by accident:
--   - check_out uses an explicit `SELECT ... FOR UPDATE` row lock, because
--     it's a COUNTING problem (active loans < copies_total) that can't be
--     expressed as a single atomic UPDATE.
--   - redeem_card uses a plain atomic `UPDATE ... WHERE claimed_by IS NULL`,
--     because claiming a card is a simple unclaimed->claimed bit flip that
--     Postgres already serializes correctly without a separate lock step.

-- Supabase installs extensions into the `extensions` schema by default, not
-- `public` — functions below that need pgcrypto must include that schema
-- in their search_path or schema-qualify the call explicitly.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- check_out: Finding 3 (row-locked concurrency) + Finding 17 (overdue
-- members are blocked from checking out anything new).
-- ---------------------------------------------------------------------
create or replace function public.check_out(p_item_id text)
returns public.loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copies int;
  v_active int;
  v_overdue int;
  v_loan public.loans;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to check out an item';
  end if;

  select count(*) into v_overdue
  from public.loans
  where user_id = auth.uid() and returned_at is null and due_at < now();

  if v_overdue > 0 then
    raise exception 'you have an overdue item — return it before checking out another';
  end if;

  -- Row lock: a second concurrent call for the same item_id blocks here
  -- until this transaction commits or rolls back, then re-reads the
  -- now-current active loan count. This is what actually prevents
  -- overselling the last copy (the bug this whole plan exists to fix).
  select copies_total into v_copies
  from public.items
  where item_id = p_item_id
  for update;

  if v_copies is null then
    raise exception 'unknown item %', p_item_id;
  end if;

  select count(*) into v_active
  from public.loans
  where item_id = p_item_id and returned_at is null;

  if v_active >= v_copies then
    raise exception 'no copies available';
  end if;

  insert into public.loans (item_id, user_id, due_at)
  values (p_item_id, auth.uid(), now() + interval '14 days')
  returning * into v_loan;

  return v_loan;
end;
$$;

-- ---------------------------------------------------------------------
-- return_item: only the holder can return their own active loan.
-- ---------------------------------------------------------------------
create or replace function public.return_item(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to return an item';
  end if;

  update public.loans
    set returned_at = now()
    where id = p_loan_id
      and user_id = auth.uid()
      and returned_at is null;

  if not found then
    raise exception 'loan not found, not yours, or already returned';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- join_queue / leave_queue: the unique(item_id, user_id) index from T1
-- already stops double-joining; this just gives it a clean error message
-- instead of a raw constraint-violation.
-- ---------------------------------------------------------------------
create or replace function public.join_queue(p_item_id text)
returns public.queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.queue_entries;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to join a queue';
  end if;

  insert into public.queue_entries (item_id, user_id)
  values (p_item_id, auth.uid())
  returning * into v_entry;

  return v_entry;
exception
  when unique_violation then
    raise exception 'already in queue for this item';
end;
$$;

create or replace function public.leave_queue(p_item_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to leave a queue';
  end if;

  delete from public.queue_entries
  where item_id = p_item_id and user_id = auth.uid();

  if not found then
    raise exception 'not in queue for this item';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Card codes: 16 random bytes -> 32 hex chars, 128 bits of entropy.
-- Satisfies Finding 15 (crypto-random, not guessable) inline, since
-- redeem_card needs a code-generation strategy to mint new cards anyway.
-- ---------------------------------------------------------------------
create or replace function public.generate_card_code()
returns text
language sql
set search_path = public, extensions
as $$
  select encode(extensions.gen_random_bytes(16), 'hex');
$$;

-- validate_card_code: callable by anon (unauthenticated) users, on purpose.
-- Client checks a code BEFORE sending a magic-link email, so invalid codes
-- never get an email sent. Read-only, no side effects — safe to expose.
create or replace function public.validate_card_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.library_cards
    where code = p_code and claimed_by is null
  );
$$;

-- redeem_card: Finding 5. Runs AFTER the user has authenticated via magic
-- link (auth.uid() is available). The UPDATE ... WHERE claimed_by IS NULL
-- is itself the atomic claim — a second simultaneous call for the same
-- code either blocks until the first commits (then matches 0 rows) or
-- sees claimed_by already set and matches 0 rows immediately either way.
create or replace function public.redeem_card(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  i int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to redeem a card';
  end if;

  update public.library_cards
    set claimed_by = auth.uid(), claimed_at = now()
    where code = p_code and claimed_by is null
    returning id into v_card_id;

  if v_card_id is null then
    raise exception 'card code invalid or already claimed';
  end if;

  for i in 1..5 loop
    insert into public.library_cards (code, issued_by)
    values (public.generate_card_code(), auth.uid());
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: explicit, not relying on Postgres's PUBLIC-execute default.
-- validate_card_code is the only function anon can call — everything
-- else requires an authenticated session and enforces that internally.
-- ---------------------------------------------------------------------
revoke execute on function public.check_out(text) from public;
revoke execute on function public.return_item(uuid) from public;
revoke execute on function public.join_queue(text) from public;
revoke execute on function public.leave_queue(text) from public;
revoke execute on function public.validate_card_code(text) from public;
revoke execute on function public.redeem_card(text) from public;
revoke execute on function public.generate_card_code() from public;

grant execute on function public.check_out(text) to authenticated;
grant execute on function public.return_item(uuid) to authenticated;
grant execute on function public.join_queue(text) to authenticated;
grant execute on function public.leave_queue(text) to authenticated;
grant execute on function public.redeem_card(text) to authenticated;
grant execute on function public.validate_card_code(text) to anon, authenticated;
