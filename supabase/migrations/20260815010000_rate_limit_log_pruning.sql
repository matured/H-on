-- rate_limit_log had no cleanup — every check_out/return_item/join_queue/
-- leave_queue/redeem_card call inserts a row and nothing ever deletes one.
-- No window check_rate_limit() runs looks back further than 600 seconds
-- (redeem_card's 10-minute window, the longest of the five), so anything
-- older than an hour is provably dead weight: it can never affect a rate
-- limit decision again. Pruning it here, on the same call that already
-- writes to this table, keeps the table bounded per active user without
-- a scheduled job — a cron job doing this on a timer would be exactly
-- the kind of always-on background cost this cleanup is meant to avoid.

create or replace function public.check_rate_limit(p_action text, p_max_calls int, p_window_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count int;
begin
  delete from public.rate_limit_log
  where user_id = auth.uid() and created_at < now() - interval '1 hour';

  select count(*) into v_recent_count
  from public.rate_limit_log
  where user_id = auth.uid()
    and action = p_action
    and created_at > now() - (p_window_seconds || ' seconds')::interval;

  if v_recent_count >= p_max_calls then
    raise exception 'rate limit exceeded for %, try again shortly', p_action;
  end if;

  insert into public.rate_limit_log (user_id, action) values (auth.uid(), p_action);
end;
$$;
