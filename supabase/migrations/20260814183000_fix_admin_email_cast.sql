-- Fix: auth.users.email is character varying, not text. The T11 admin
-- RPCs declared their return tables as `email text` but selected
-- u.email directly, which Postgres rejects with "structure of query
-- does not match function result type" — varchar and text don't
-- implicitly coerce inside a RETURN QUERY. Explicit ::text cast fixes it.

create or replace function public.admin_list_profiles()
returns table (
  user_id uuid,
  email text,
  is_admin boolean,
  banned boolean,
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
    select p.user_id, u.email::text, p.is_admin, p.banned, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    order by p.created_at asc;
end;
$$;

create or replace function public.admin_list_loans()
returns table (
  loan_id uuid,
  item_id text,
  user_email text,
  checked_out_at timestamptz,
  due_at timestamptz
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
    select l.id, l.item_id, u.email::text, l.checked_out_at, l.due_at
    from public.loans l
    join auth.users u on u.id = l.user_id
    where l.returned_at is null
    order by l.due_at asc;
end;
$$;
