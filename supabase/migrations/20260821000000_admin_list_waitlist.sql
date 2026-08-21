-- The waitlist_requests table (20260817000000) is insert-only: no select
-- policy exists for anyone, admin included, so submissions were only ever
-- readable from the Supabase dashboard directly. This closes that gap the
-- same way every other admin read was closed (T11) — a SECURITY DEFINER
-- RPC gated by is_admin(), no new RLS policy needed on the table itself.

create or replace function public.admin_list_waitlist()
returns table (
  id bigint,
  name text,
  email text,
  note text,
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

  -- Capped so an unbounded flood of anon inserts (the table has no rate
  -- limiting on writes — see TODOS.md) can't turn one admin page load into
  -- an unbounded render. 500 is far above any realistic signup volume for
  -- an invite-only library; raise it if that stops being true.
  return query
    select w.id, w.name, w.email, w.note, w.created_at
    from public.waitlist_requests w
    order by w.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.admin_list_waitlist() from public;
grant execute on function public.admin_list_waitlist() to authenticated;
