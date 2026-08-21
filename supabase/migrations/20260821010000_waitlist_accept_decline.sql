-- Lets an admin act on a waitlist request instead of just reading it:
-- accept (issue a card, same as admin_issue_card, but attributed to this
-- specific request) or decline (no card, just marks it handled). Both are
-- SECURITY DEFINER RPCs gated by is_admin(), matching every other admin
-- write in this schema.

alter table public.waitlist_requests
  add column status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined'));

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

  insert into public.library_cards (code, issued_by)
  values (public.generate_card_code(), auth.uid())
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
create or replace function public.admin_list_waitlist()
returns table (
  id bigint,
  name text,
  email text,
  note text,
  status text,
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
    select w.id, w.name, w.email, w.note, w.status, w.created_at
    from public.waitlist_requests w
    order by (w.status = 'pending') desc, w.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.admin_accept_waitlist_request(bigint) from public;
revoke execute on function public.admin_decline_waitlist_request(bigint) from public;

grant execute on function public.admin_accept_waitlist_request(bigint) to authenticated;
grant execute on function public.admin_decline_waitlist_request(bigint) to authenticated;
