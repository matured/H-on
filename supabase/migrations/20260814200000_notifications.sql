-- T13: in-app queue notifications (TODO 1), chosen over email + Edge
-- Function to avoid a third external service (email provider) and a
-- Supabase Edge Function deploy neither of which this project has any
-- established pattern for yet — given how much friction the Auth URL
-- config alone caused, an in-app banner keeps this fully inside
-- Supabase and the existing SQL-editor verification workflow.
--
-- Not a reservation/hold system: notifying the front of the queue does
-- NOT remove them from queue_entries or block anyone else from checking
-- the item out first. It's a nudge, not a guarantee — check_out has
-- never enforced queue order (first successful call wins, race-safe via
-- the row lock), and this doesn't change that.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  item_id text not null references public.items (item_id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "users read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- mark_notification_read: only the notification's own recipient can
-- dismiss it.
-- ---------------------------------------------------------------------
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  update public.notifications
    set read_at = now()
    where id = p_id and user_id = auth.uid();

  if not found then
    raise exception 'notification not found or not yours';
  end if;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- return_item / admin_force_return: after a successful return, notify
-- whoever has been waiting longest for that item (if anyone). Same
-- shape both places — grab item_id from the update, look up the
-- earliest queue_entries row for it, insert one notification.
-- ---------------------------------------------------------------------
create or replace function public.return_item(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id text;
  v_next_user uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to return an item';
  end if;

  update public.loans
    set returned_at = now()
    where id = p_loan_id
      and user_id = auth.uid()
      and returned_at is null
    returning item_id into v_item_id;

  if not found then
    raise exception 'loan not found, not yours, or already returned';
  end if;

  select user_id into v_next_user
  from public.queue_entries
  where item_id = v_item_id
  order by joined_at asc
  limit 1;

  if v_next_user is not null then
    insert into public.notifications (user_id, item_id) values (v_next_user, v_item_id);
  end if;
end;
$$;

create or replace function public.admin_force_return(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id text;
  v_next_user uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.loans
    set returned_at = now()
    where id = p_loan_id and returned_at is null
    returning item_id into v_item_id;

  if not found then
    raise exception 'loan not found or already returned';
  end if;

  select user_id into v_next_user
  from public.queue_entries
  where item_id = v_item_id
  order by joined_at asc
  limit 1;

  if v_next_user is not null then
    insert into public.notifications (user_id, item_id) values (v_next_user, v_item_id);
  end if;
end;
$$;
