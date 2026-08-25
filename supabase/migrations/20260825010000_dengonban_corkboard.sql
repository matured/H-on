-- Corkboard redesign (T18): color, free positioning, optional doodle, and
-- anonymous posting for the community board.

alter table public.dengonban_messages
  alter column user_id drop not null;  -- anon posts have user_id = null

alter table public.dengonban_messages
  add column color text not null default '#fef3c7'
    check (color in ('#fef3c7','#fbcfe8','#bfdbfe','#bbf7d0','#fed7aa','#ddd6fe')),
  -- Percentage of the board area (0-100), not pixels, so a note's position
  -- reflows sensibly across viewport widths instead of hard-coding a
  -- desktop-sized coordinate space (same reflow discipline already applied
  -- to the splash caption, tests/e2e/splash-enter.spec.js).
  add column pos_x numeric(5,2) not null default 50 check (pos_x >= 0 and pos_x <= 100),
  add column pos_y numeric(5,2) not null default 50 check (pos_y >= 0 and pos_y <= 100),
  -- Array of strokes, each an array of [x, y] pairs in fixed 160x90
  -- canvas-pixel space — the doodle canvas is a small, never-resized
  -- decorative element, unlike pos_x/pos_y which position the whole note
  -- on a board area that genuinely reflows, so percentages would just add
  -- fragile aspect-ratio math for no benefit here.
  add column doodle jsonb;

-- No rotation column: computed deterministically client-side from a hash
-- of the note's id at render time, so every reload shows the same tilt
-- without a migration or a write path for it.

-- ---------------------------------------------------------------------
-- validate_dengonban_doodle: called from post_dengonban_message. Caps
-- strokes/points/payload size and requires every point to be an in-range
-- numeric pair — the doodle is rendered client-side as raw numeric SVG
-- polyline points (see dengonbanDoodleSVG in board.html), not treated as
-- HTML/text, so this is the security boundary for that render path the
-- same way honEscape() is the boundary for note bodies.
-- ---------------------------------------------------------------------
create or replace function public.validate_dengonban_doodle(p_doodle jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stroke jsonb;
  v_point jsonb;
begin
  if p_doodle is null then
    return;
  end if;

  if jsonb_typeof(p_doodle) <> 'array' or jsonb_array_length(p_doodle) > 6 then
    raise exception 'invalid doodle: too many strokes';
  end if;

  if pg_column_size(p_doodle) > 6000 then
    raise exception 'invalid doodle: payload too large';
  end if;

  for v_stroke in select * from jsonb_array_elements(p_doodle) loop
    if jsonb_typeof(v_stroke) <> 'array' or jsonb_array_length(v_stroke) > 120 then
      raise exception 'invalid doodle: stroke malformed';
    end if;
    for v_point in select * from jsonb_array_elements(v_stroke) loop
      if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
         or jsonb_typeof(v_point->0) <> 'number' or jsonb_typeof(v_point->1) <> 'number'
         or (v_point->>0)::numeric < 0 or (v_point->>0)::numeric > 160
         or (v_point->>1)::numeric < 0 or (v_point->>1)::numeric > 90 then
        raise exception 'invalid doodle: point out of range';
      end if;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.validate_dengonban_doodle(jsonb) from public;
grant execute on function public.validate_dengonban_doodle(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- post_dengonban_message: signature is changing (color/position/doodle/
-- anon token added), not just the body — create or replace rejects a
-- changed return-column list, and while this is a parameter-list change
-- (not return-column), PostgREST would otherwise see two ambiguous
-- overloads (the old single-arg version and this one) unless the old one
-- is explicitly dropped first.
--
-- Branches on auth.uid(): signed-in members still go through
-- check_rate_limit() + the banned check exactly as before; anonymous
-- callers go through check_anon_dengonban_rate_limit() instead and skip
-- the banned check entirely (there's no profiles row for an anon caller —
-- the rate limiter is their only backstop, which is the scope already
-- agreed for this feature).
-- ---------------------------------------------------------------------
drop function if exists public.post_dengonban_message(text);

create or replace function public.post_dengonban_message(
  p_body text,
  p_color text,
  p_pos_x numeric,
  p_pos_y numeric,
  p_doodle jsonb default null,
  p_anon_token uuid default null
)
returns public.dengonban_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_banned boolean;
  v_body text;
  v_msg public.dengonban_messages;
begin
  if v_uid is not null then
    select banned into v_banned from public.profiles where user_id = v_uid;
    if coalesce(v_banned, false) then
      raise exception 'this account has been suspended from posting';
    end if;
    perform public.check_rate_limit('post_dengonban_message', 5, 600);
  else
    perform public.check_anon_dengonban_rate_limit(p_anon_token);
  end if;

  if p_color not in ('#fef3c7','#fbcfe8','#bfdbfe','#bbf7d0','#fed7aa','#ddd6fe') then
    raise exception 'invalid note color';
  end if;
  if p_pos_x < 0 or p_pos_x > 100 or p_pos_y < 0 or p_pos_y > 100 then
    raise exception 'invalid note position';
  end if;
  perform public.validate_dengonban_doodle(p_doodle);

  v_body := trim(p_body);
  if char_length(v_body) < 1 then
    raise exception 'message cannot be empty';
  end if;

  insert into public.dengonban_messages (user_id, body, color, pos_x, pos_y, doodle)
  values (v_uid, v_body, p_color, p_pos_x, p_pos_y, p_doodle)
  returning * into v_msg;

  return v_msg;
end;
$$;

revoke execute on function public.post_dengonban_message(text, text, numeric, numeric, jsonb, uuid) from public;
grant execute on function public.post_dengonban_message(text, text, numeric, numeric, jsonb, uuid) to anon, authenticated;

-- admin_hide_dengonban_message: unchanged, reused as-is for the new
-- inline "remove from board" action in board.html.

-- ---------------------------------------------------------------------
-- admin_list_dengonban: left join instead of join since user_id can now
-- be null (anon posts); surfaces color/position and whether a doodle is
-- present (a boolean, not the raw stroke data — enough for moderation
-- triage without needing to render it).
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_dengonban();

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
    select m.id, u.email, m.body, m.created_at, m.expires_at, m.hidden,
           m.color, m.pos_x, m.pos_y, (m.doodle is not null)
    from public.dengonban_messages m
    left join auth.users u on u.id = m.user_id
    order by m.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.admin_list_dengonban() from public;
grant execute on function public.admin_list_dengonban() to authenticated;
