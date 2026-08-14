-- Self-service account deletion. A signed-in user can delete their own
-- account and everything tied to it. Two safety gates: blocks while an
-- active (unreturned) loan exists — same "return it first" principle a
-- real library would apply — and blocks the sole admin account from
-- deleting itself, to avoid accidentally locking the whole admin
-- surface with no way back in.
--
-- library_cards rows (issued_by or claimed_by = this user) are deleted
-- outright rather than having their FKs nulled out — nothing else in
-- the app reads through a card row to reach the OTHER party's identity;
-- the claimer's own account, loans, etc. are all independently keyed by
-- their own user_id, so their membership isn't affected by the card
-- record disappearing.
--
-- Deletes auth.users directly via a security definer function rather
-- than the Auth Admin API (which needs the service role key — never
-- available client-side, and never will be). Supabase's own docs note
-- this bypasses some GoTrue-side bookkeeping (e.g. active session
-- invalidation isn't automatic); acceptable here given the scale and
-- stakes of this project.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_active_loans int;
begin
  if v_uid is null then
    raise exception 'must be authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where user_id = v_uid;
  if coalesce(v_is_admin, false) then
    raise exception 'admins cannot delete their own account — remove admin status first';
  end if;

  select count(*) into v_active_loans
  from public.loans
  where user_id = v_uid and returned_at is null;
  if v_active_loans > 0 then
    raise exception 'return your active loan(s) before deleting your account';
  end if;

  delete from public.queue_entries where user_id = v_uid;
  delete from public.loans where user_id = v_uid;
  delete from public.library_cards where issued_by = v_uid or claimed_by = v_uid;
  delete from public.notifications where user_id = v_uid;
  delete from public.rate_limit_log where user_id = v_uid;

  -- profiles cascades automatically via its own FK (on delete cascade, T4).
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
