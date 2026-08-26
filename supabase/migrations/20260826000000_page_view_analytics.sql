-- T19: self-hosted page-view analytics (daily counts, top referrers, top
-- pages) — no third-party service, no cookies. Same posture as
-- rate_limit_log / dengonban_anon_rate_limit: a zero-RLS-policy table,
-- reachable only through security definer functions.
--
-- visitor_id is a client-generated uuid persisted in localStorage
-- (honGetOrCreateVisitorId in js/circulation.js — same "carry one opaque
-- value across page loads" pattern as the dengonban anon rate-limit
-- token, deliberately a SEPARATE token so a visitor's analytics identity
-- can't be correlated with their dengonban posting identity). It's not
-- tied to any real identity, isn't a cookie, and resets if someone clears
-- storage — a rough visitor count, not a fingerprint.
--
-- No retention pruning here, unlike rate_limit_log: that table's rows are
-- provably dead weight once outside every rate-limit window it's ever
-- checked against. This table's whole purpose is to persist so trends
-- are visible later — deleting old rows would destroy the very data
-- being collected. At this site's traffic scale, unbounded growth isn't
-- a real concern for years.

create table public.page_views (
  id bigint generated always as identity primary key,
  path text not null check (char_length(path) between 1 and 200),
  referrer text check (referrer is null or char_length(referrer) <= 200),
  visitor_id uuid not null,
  created_at timestamptz not null default now()
);

create index page_views_created_at_idx on public.page_views (created_at);
create index page_views_visitor_idx on public.page_views (visitor_id, created_at);

alter table public.page_views enable row level security;
-- No policies: writes only through log_page_view() (security definer),
-- reads only through the admin_pageview_* functions below.

-- ---------------------------------------------------------------------
-- log_page_view: intentionally NOT behind check_rate_limit()/an anon
-- equivalent. Worst case of abuse here is noisy analytics rows, not a
-- security or resource risk — the length checks below already stop
-- large-payload spam, and a dedicated rate limiter would add real
-- complexity (blocking real visitors browsing several pages quickly)
-- for a threat with no real payoff for an attacker.
-- ---------------------------------------------------------------------
create or replace function public.log_page_view(p_path text, p_referrer text, p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
  v_referrer text;
begin
  if p_visitor_id is null then
    raise exception 'missing visitor id';
  end if;

  v_path := trim(coalesce(p_path, ''));
  if char_length(v_path) < 1 or char_length(v_path) > 200 then
    raise exception 'invalid path';
  end if;

  v_referrer := nullif(trim(coalesce(p_referrer, '')), '');
  if v_referrer is not null and char_length(v_referrer) > 200 then
    raise exception 'invalid referrer';
  end if;

  insert into public.page_views (path, referrer, visitor_id)
  values (v_path, v_referrer, p_visitor_id);
end;
$$;

revoke execute on function public.log_page_view(text, text, uuid) from public;
grant execute on function public.log_page_view(text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- admin_pageview_daily: pageviews + unique visitors per day, for the
-- admin.html Traffic panel's chart/table.
-- ---------------------------------------------------------------------
create or replace function public.admin_pageview_daily(p_days int default 30)
returns table (day date, pageviews bigint, unique_visitors bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select date_trunc('day', created_at)::date as day,
           count(*) as pageviews,
           count(distinct visitor_id) as unique_visitors
    from public.page_views
    where created_at > now() - (p_days || ' days')::interval
    group by 1
    order by 1 desc;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_pageview_top_referrers: external traffic sources only — the
-- client never sends a same-origin referrer as one (see
-- honLogPageView), so every row here is a real external source, not
-- internal site navigation noise.
-- ---------------------------------------------------------------------
create or replace function public.admin_pageview_top_referrers(p_days int default 30, p_limit int default 20)
returns table (referrer text, views bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select p.referrer, count(*) as views
    from public.page_views p
    where p.created_at > now() - (p_days || ' days')::interval
      and p.referrer is not null
    group by p.referrer
    order by views desc
    limit p_limit;
end;
$$;

create or replace function public.admin_pageview_top_paths(p_days int default 30, p_limit int default 20)
returns table (path text, views bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select p.path, count(*) as views
    from public.page_views p
    where p.created_at > now() - (p_days || ' days')::interval
    group by p.path
    order by views desc
    limit p_limit;
end;
$$;

revoke execute on function public.admin_pageview_daily(int) from public;
revoke execute on function public.admin_pageview_top_referrers(int, int) from public;
revoke execute on function public.admin_pageview_top_paths(int, int) from public;
grant execute on function public.admin_pageview_daily(int) to authenticated;
grant execute on function public.admin_pageview_top_referrers(int, int) to authenticated;
grant execute on function public.admin_pageview_top_paths(int, int) to authenticated;
