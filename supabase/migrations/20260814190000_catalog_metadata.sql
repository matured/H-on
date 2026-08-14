-- T12: metadata migration. js/catalog-data.js was the only source of
-- truth for title/cover/description — items only tracked copies_total
-- (T1). This adds the metadata columns directly to items (one row per
-- title covering both concerns, matching Finding 13's "single source of
-- truth" principle rather than introducing a second table to join),
-- backfills the 15 real catalog rows, and adds the admin RPC to add/edit
-- titles going forward.
--
-- Note: items was confirmed EMPTY before this migration — nobody had
-- ever actually checked out a real catalog title; every "1 copy in the
-- collection" / "on the shelf" display up to now ran on the client-side
-- `?? 1` fallback in circulation.js, not real rows. This migration is
-- what makes checkout real for the first time, not just a metadata tidy-up.

alter table public.items
  add column title text,
  add column subtitle text,
  add column issue text,
  add column era text,
  add column genre text,
  add column call_number text,
  add column cover_bg text,
  add column cover_fg text,
  add column cover_accent text,
  add column cover_image text,
  add column back_image text,
  add column description text;

insert into public.items (item_id, copies_total, title, subtitle, issue, era, genre, call_number, cover_bg, cover_fg, cover_accent, cover_image, back_image, description)
values
  ('burst-vol15', 1, 'BURST', null, 'Vol.15', '1998', 'Tattoo & Subculture', '本 · TS · 98-015', '#0a0a0a', '#faf9f4', '#3a6ea5', 'images/covers/BURST-vol15-front.jpg', 'images/covers/BURST-vol15-back.jpg', 'A reader-submitted portrait series of Tokyo''s young outsiders, bōsōzoku bikers, tattooed wrestlers, hardcore punks, runs alongside dispatches from tattoo conventions around Japan in this July 1998 issue.'),
  ('burst-vol16', 1, 'BURST', null, 'Vol.16', '1998', 'Tattoo & Subculture', '本 · TS · 98-016', '#1a1a1a', '#d4af37', '#c8102e', 'images/covers/BURST-vol16-front.jpg', 'images/covers/BURST-vol16-back.jpg', 'Four members of a Tokyo punk crew appear on the cover of an issue built around a Che Guevara retrospective, interviews with the band circling Shinjuku''s live houses, and tattoo event reports from across Japan.'),
  ('burst-vol17', 1, 'BURST', 'Topless Government', 'Vol.17', '1998', 'Tattoo & Subculture', '本 · TS · 98-017', '#faf9f4', '#c8102e', '#0a0a0a', 'images/covers/BURST-vol17-front.jpg', 'images/covers/BURST-vol17-back.jpg', 'A cover feature on a fully tattooed model runs alongside a garage-rock compilation insert, part of BURST''s ongoing coverage of Japan''s tattoo culture years before it had mainstream visibility.'),
  ('burst-vol24', 1, 'BURST', null, 'Vol.24', '1999', 'Tattoo & Subculture', '本 · TS · 99-024', '#3a4a5a', '#faf9f4', '#c8102e', 'images/covers/BURST-vol24-front.jpg', 'images/covers/BURST-vol24-back.jpg', 'An investigative feature on wild-growing cannabis in Hokkaido shares this December 1999 issue with coverage of a European motorcycle leather jacket convention and a Tokyo tattoo expo.'),
  ('burst-vol41', 1, 'BURST', null, 'Vol.41', '2001', 'Tattoo & Subculture', '本 · TS · 01-041', '#8a8a8a', '#e91e8c', '#c8102e', 'images/covers/BURST-vol41-front.jpg', 'images/covers/BURST-vol41-back.jpg', 'A cover feature on a photographer''s dispatch from Zapatista territory in Chiapas runs alongside an interview with musician Phew, a rare collision of BURST''s tabloid sensationalism with war photography.'),
  ('burst-vol47', 1, 'BURST', null, 'Vol.47', '2001', 'Tattoo & Subculture', '本 · TS · 01-047', '#5a6b3a', '#faf9f4', '#d68a1a', 'images/covers/BURST-vol47-front.jpg', 'images/covers/BURST-vol47-back.jpg', 'A home-growing guide reprinted from High Times, with an interview with its editor Steven Hager, anchors this November 2001 issue alongside a retrospective on Japan''s early rave and trance scene.'),
  ('fruits-no92', 1, 'FRUITS', null, 'No.92', '2005', 'Street Fashion', '本 · SF · 05-092', '#0f4c81', '#faf9f4', '#e91e8c', 'images/covers/FRUITS-no92-front.jpg', 'images/covers/FRUITS-no92-back.jpg', 'A single BMX-riding street snap from Harajuku, shot in FRUITS'' signature format of one outfit against one backdrop with almost no text, the magazine that made Shoichi Aoki''s street photography its own genre.'),
  ('street-no182', 1, 'STREET', null, 'No.182', '2006', 'Street Fashion', '本 · SF · 06-182', '#0a3d3d', '#faf9f4', '#ff4d6d', 'images/covers/STREET-no182-front.jpg', 'images/covers/STREET-no182-back.jpg', 'A group portrait of London and Berlin club kids for STREET''s recurring project setting Tokyo style against other capitals'' scenes, Shoichi Aoki''s parallel magazine alongside FRUITS.'),
  ('tune-no86', 1, 'TUNE', null, 'No.86', '2011', 'Street Fashion', '本 · SF · 11-086', '#b91c1c', '#faf9f4', '#0a0a0a', 'images/covers/TUNE-no86-front.jpg', 'images/covers/TUNE-no86-back.jpg', 'A Harajuku street-style snap on the cover pairs with an ad for Osaka label monomania on the reverse, typical of TUNE''s format mixing candid photography with brand advertising.'),
  ('lightning-vol28', 1, '別冊Lightning', 'Denim Style Book 2', 'Vol.28 (Bessatsu)', '2006', 'Heritage Menswear', '本 · HM · 06-028', '#1e5aa8', '#faf9f4', '#e8531e', 'images/covers/Lightning-vol28-front.jpg', 'images/covers/Lightning-vol28-back.jpg', 'A themed denim mook under the Lightning banner, cataloguing vintage jeans construction, with a Yamane repro-denim advertisement on the back cover. Part of Lightning''s separately numbered Bessatsu supplement series, not the main monthly run.'),
  ('lightning-vol35', 1, '別冊Lightning', 'Coffee Style Book', 'Vol.35 (Bessatsu)', '2007', 'Heritage Menswear', '本 · HM · 07-035', '#5a3a28', '#faf9f4', '#e8531e', 'images/covers/Lightning-vol35-front.jpg', 'images/covers/Lightning-vol35-back.jpg', 'A themed supplement pairing vintage espresso equipment and mug collecting with a Suntory BOSS canned-coffee advertisement on the reverse. Part of the same Bessatsu Lightning mook series as the Denim Style Book.'),
  ('lightning-vol354', 1, 'Lightning', 'Cool Used Clothing', 'Vol.354', '2023', 'Heritage Menswear', '本 · HM · 23-354', '#f0ede2', '#2d6a4f', '#e8a13a', 'images/covers/Lightning-vol354-front.jpg', 'images/covers/Lightning-vol354-back.jpg', 'A worn pair of vintage Levi''s anchors this issue''s guide to loose, broken-in secondhand clothing, with a Schott NYC 110th-anniversary advertisement on the back.'),
  ('lightning-vol360', 1, 'Lightning', 'Mid-Century', 'Vol.360', '2024', 'Heritage Menswear', '本 · HM · 24-360', '#f0ede2', '#d63a8c', '#3a6ea5', 'images/covers/Lightning-vol360-front.jpg', 'images/covers/Lightning-vol360-back.jpg', 'An Eames fiberglass rocking chair fronts a mid-century furniture and design issue, backed by an advertisement for Unkochan, an Osaka-area vintage furniture retailer.'),
  ('lightning-vol367', 1, 'Lightning', 'Work Wear', 'Vol.367', '2024', 'Heritage Menswear', '本 · HM · 24-367', '#e8c934', '#0a0a0a', '#c8102e', 'images/covers/Lightning-vol367-front.jpg', 'images/covers/Lightning-vol367-back.jpg', 'A well-worn denim chore coat fronts a workwear-focused issue tracing the garment''s roots, paired with a Red Wing boots advertisement on the reverse.'),
  ('lightning-vol372', 1, 'Lightning', 'Focus on Sweat Shirts', 'Vol.372', '2025', 'Heritage Menswear', '本 · HM · 25-372', '#2d4a3a', '#e8a13a', '#faf9f4', 'images/covers/Lightning-vol372-front.jpg', 'images/covers/Lightning-vol372-back.jpg', 'A single vintage sweatshirt on a hanger fronts an issue tracing the garment from military surplus to street-style staple, with a Wesco motorcycle boots advertisement on the back.'),
  ('lightning-vol378', 1, 'Lightning', 'Cowboy Style Forever', 'Vol.378', '2025', 'Heritage Menswear', '本 · HM · 25-378', '#faf9f4', '#e8531e', '#0a0a0a', 'images/covers/Lightning-vol378-front.jpg', 'images/covers/Lightning-vol378-back.jpg', 'A rodeo rider mid-bronc fronts Lightning''s cowboy workwear issue, backed by another Wesco leather motorcycle boots advertisement.'),
  ('xbox360-2009', 1, 'ファミ通Xbox360', 'Famitsu Xbox 360', 'Sept. 2009', '2009', 'Gaming Culture', '本 · GM · 09-001', '#0a0a0a', '#e8531e', '#faf9f4', 'images/covers/Xbox360-2009-front.jpg', 'images/covers/Xbox360-2009-back.jpg', 'A Japanese gaming magazine''s coverage of the domestic launch of Gears of War 2, with a promotional back-cover feature for the visual novel Steins;Gate ahead of its October 2009 release.')
on conflict (item_id) do update set
  copies_total = excluded.copies_total,
  title = excluded.title,
  subtitle = excluded.subtitle,
  issue = excluded.issue,
  era = excluded.era,
  genre = excluded.genre,
  call_number = excluded.call_number,
  cover_bg = excluded.cover_bg,
  cover_fg = excluded.cover_fg,
  cover_accent = excluded.cover_accent,
  cover_image = excluded.cover_image,
  back_image = excluded.back_image,
  description = excluded.description;

-- Now that every existing row has a value, require the fields a title
-- can't sensibly be shown without. cover_image/back_image/subtitle stay
-- nullable — item.js already falls back to a typographic card when
-- cover_image is null.
alter table public.items
  alter column title set not null,
  alter column issue set not null,
  alter column era set not null,
  alter column genre set not null,
  alter column call_number set not null,
  alter column cover_bg set not null,
  alter column cover_fg set not null,
  alter column cover_accent set not null,
  alter column description set not null;

-- ---------------------------------------------------------------------
-- admin_upsert_item: add a new title or edit an existing one. Single RPC
-- for both — item_id existing or not is the only branch.
-- ---------------------------------------------------------------------
create or replace function public.admin_upsert_item(
  p_item_id text,
  p_title text,
  p_subtitle text,
  p_issue text,
  p_era text,
  p_genre text,
  p_call_number text,
  p_copies_total int,
  p_cover_bg text,
  p_cover_fg text,
  p_cover_accent text,
  p_cover_image text,
  p_back_image text,
  p_description text
)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  insert into public.items (
    item_id, title, subtitle, issue, era, genre, call_number, copies_total,
    cover_bg, cover_fg, cover_accent, cover_image, back_image, description
  )
  values (
    p_item_id, p_title, p_subtitle, p_issue, p_era, p_genre, p_call_number, p_copies_total,
    p_cover_bg, p_cover_fg, p_cover_accent, p_cover_image, p_back_image, p_description
  )
  on conflict (item_id) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    issue = excluded.issue,
    era = excluded.era,
    genre = excluded.genre,
    call_number = excluded.call_number,
    copies_total = excluded.copies_total,
    cover_bg = excluded.cover_bg,
    cover_fg = excluded.cover_fg,
    cover_accent = excluded.cover_accent,
    cover_image = excluded.cover_image,
    back_image = excluded.back_image,
    description = excluded.description
  returning * into v_item;

  return v_item;
end;
$$;

revoke execute on function public.admin_upsert_item(text, text, text, text, text, text, text, int, text, text, text, text, text, text) from public;
grant execute on function public.admin_upsert_item(text, text, text, text, text, text, text, int, text, text, text, text, text, text) to authenticated;
