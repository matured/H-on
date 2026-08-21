-- Lets an admin act on a waitlist request instead of just reading it:
-- accept (issue a card, same as admin_issue_card, but attributed to this
-- specific request) or decline (no card, just marks it handled). Both are
-- SECURITY DEFINER RPCs gated by is_admin(), matching every other admin
-- write in this schema.

alter table public.waitlist_requests
  add column status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined'));

-- 20260817000000's insert policy is `with check (true)` — before this
-- column existed that was fine (nothing to forge), but an anon caller can
-- set ANY column on an insert their policy allows, including one added
-- later. Without this, anyone holding the (necessarily public) anon key
-- could submit a waitlist request with status already 'accepted' or
-- 'declined', bypassing both RPCs below and polluting the admin's queue
-- with rows that read as already-handled. DEFAULT alone doesn't stop
-- this — it only applies when the client omits the column, not when they
-- explicitly set it.
drop policy "anyone can submit a waitlist request" on public.waitlist_requests;

create policy "anyone can submit a pending waitlist request"
  on public.waitlist_requests
  for insert
  to anon, authenticated
  with check (status = 'pending');

-- Links a card back to the request it was issued for, so the code is
-- recoverable by re-querying instead of only ever existing in the one
-- response object admin_accept_waitlist_request returns. Nullable: only
-- ever set by that RPC, not by admin_issue_card()'s generic mint.
alter table public.library_cards
  add column waitlist_request_id bigint references public.waitlist_requests (id);

create or replace function public.admin_accept_waitlist_request(p_request_id bigint)
returns public.library_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.library_cards;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  -- Row lock: guards against a double-click (or two admins) accepting the
  -- same request twice and minting two cards for one person.
  update public.waitlist_requests
    set status = 'accepted'
    where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'request not found or already handled';
  end if;

  insert into public.library_cards (code, issued_by, waitlist_request_id)
  values (public.generate_card_code(), auth.uid(), p_request_id)
  returning * into v_card;

  return v_card;
end;
$$;

create or replace function public.admin_decline_waitlist_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.waitlist_requests
    set status = 'declined'
    where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'request not found or already handled';
  end if;
end;
$$;

-- admin_list_waitlist now surfaces status too, with pending requests
-- sorted first — that's the queue an admin actually works through; already
-- handled requests are still visible below for a record of who was
-- accepted/declined, not hidden once acted on.
--
-- CREATE OR REPLACE cannot change a function's return-column list (only
-- the body) — Postgres raises "cannot change return type of existing
-- function" and refuses. The prior version (20260821000000) returns table
-- (id, name, email, note, created_at); this one adds status, so the old
-- function has to be dropped first or the whole migration file aborts.
drop function if exists public.admin_list_waitlist();

-- card_code is left-joined from library_cards via the FK added above, so
-- an accepted request's code survives a page reload instead of only ever
-- existing in the single response object admin_accept_waitlist_request
-- returns at the moment of acceptance. Null for pending/declined rows,
-- and for any card issued before this column existed.
create function public.admin_list_waitlist()
returns table (
  id bigint,
  name text,
  email text,
  note text,
  status text,
  card_code text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select w.id, w.name, w.email, w.note, w.status, c.code, w.created_at
    from public.waitlist_requests w
    left join public.library_cards c on c.waitlist_request_id = w.id
    order by (w.status = 'pending') desc, w.created_at desc
    limit 500;
end;
$$;

-- admin_list_waitlist's own grant doesn't survive the drop above — a
-- freshly created function starts with default (no) privileges, not
-- whatever the dropped one had.
revoke execute on function public.admin_accept_waitlist_request(bigint) from public;
revoke execute on function public.admin_decline_waitlist_request(bigint) from public;
revoke execute on function public.admin_list_waitlist() from public;

grant execute on function public.admin_accept_waitlist_request(bigint) to authenticated;
grant execute on function public.admin_decline_waitlist_request(bigint) to authenticated;
grant execute on function public.admin_list_waitlist() to authenticated;
