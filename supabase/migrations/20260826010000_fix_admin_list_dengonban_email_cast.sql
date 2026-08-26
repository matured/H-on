-- Fixes a real bug in admin.html's Dengonban board panel: querying
-- admin_list_dengonban() raised "structure of query does not match
-- function result type" / "Returned type character varying(255) does
-- not match expected type text in column 2" — auth.users.email is
-- character varying(255), not text, and the function's RETURNS TABLE
-- declares user_email as text with no cast to bridge the two.
--
-- This bug predates the corkboard redesign — it was already present in
-- the very first admin_list_dengonban() (20260824000000_dengonban.sql)
-- and was carried forward unchanged when 20260825010000_dengonban_
-- corkboard.sql added the new color/position/doodle columns. It went
-- undetected because nothing had actually invoked this specific
-- function as a real admin end to end until now — the established
-- fix (see admin_list_profiles(), which already does this correctly)
-- is to cast explicitly: u.email::text.
create or replace function public.admin_list_dengonban()
returns table (
  id uuid,
  user_email text,
  body text,
  created_at timestamptz,
  expires_at timestamptz,
  hidden boolean,
  color text,
  pos_x numeric,
  pos_y numeric,
  doodle_present boolean
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
    select m.id, u.email::text, m.body, m.created_at, m.expires_at, m.hidden,
           m.color, m.pos_x, m.pos_y, (m.doodle is not null)
    from public.dengonban_messages m
    left join auth.users u on u.id = m.user_id
    order by m.created_at desc
    limit 500;
end;
$$;
