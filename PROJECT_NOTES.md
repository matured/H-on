# 本 (hon) — Project Notes

Mock company site for a Communications Industry Mock Company final project.
本 ("book") is a fictional invite-only digital library that circulates real
Japanese print media from 1990–2005, one reader at a time — the anti-feed,
anti-algorithm answer to how media discovery works today.

Last updated: this session (V6 + the T1-T16 backend build, 2026-08-14).

---

## Site map & entry point

**Open `index.html` to start** — it's the splash screen, not the homepage.

```
index.html          Splash: flickering 本 grid, click any tile to enter
  → catalog.html     (splash leads here — the Archive is the front door)

home.html            The actual marketing homepage (hero, mission, pillars)
about.html           Founder story, mission statement, team roles
catalog.html         The Archive — scattered floating shelf of 17 titles
item.html            Item detail page (?id=<item-id>), reached by clicking a cover
how-it-works.html    Circulation cycle, queue mechanic, CDL legal framing
membership.html      Invite-only system, 5-library-card mechanic, waitlist form
support.html         Donation tiers, Supporter perks (mock, non-functional payment)
admin.html           Founder/admin only: issue cards, force-return loans, ban
                     members. Not linked from the public nav — gated server-side
                     by the is_admin flag, not by obscurity. Added 2026-08-14 (T11).
```

The site-wide nav (black circle top-left → fullscreen overlay menu) is
injected by `js/main.js` on every page except `index.html` (the splash has no
site chrome — it's meant to be the very first thing someone sees).

---

## File structure

```
hon-site/
├── index.html            splash / entry point
├── home.html              marketing homepage
├── about.html
├── catalog.html           the Archive (shelf)
├── item.html              item detail template
├── how-it-works.html
├── membership.html
├── support.html
├── admin.html             founder/admin tool: issue cards, force-return, ban
├── css/
│   └── style.css          single shared stylesheet, all design tokens
└── js/
    ├── main.js            injects black-circle nav + overlay on every page
    ├── supabase-config.js Supabase client init (URL + publishable anon key)
    ├── circulation.js     shared state: checkout/return/queue + catalog fetch,
    │                      all against Supabase — no static data files left
    ├── browse.js          Archive page: scattered shelf layout + filters
    └── item.js            Item page: layout, background pattern, cover/detail toggle
```

No build step, no dependencies beyond Google Fonts (Archivo, Newsreader, IBM
Plex Mono, Noto Sans JP) loaded via `@import` in `style.css`. Open any HTML
file directly, or serve the folder with `python3 -m http.server` / VS Code
Live Server for more reliable `localStorage` behavior.

**Update 2026-08-14:** a real backend (Supabase) is planned to replace the
`localStorage`-only circulation state (see the `/plan-eng-review` output for
that date). This still avoids a build step — the Supabase JS client loads via
a plain `<script>` tag from their CDN, no bundler required. A test toolchain
(Vitest, via `bun`) is also being added, but as a dev-only dependency that
never ships to the deployed page. "No build step" survives; "no dependencies
at all" no longer fully holds once this lands.

---

## Key architectural decisions

- **Checkout state lives in Supabase (Postgres)**, as of 2026-08-14
  (`/plan-eng-review` T1-T5) — real shared state, real accounts, RLS-enforced
  privacy. `js/circulation.js` still centralizes checkout/return/queue logic
  for the Archive grid and item pages, same as before; only the backend
  underneath changed. `localStorage` is no longer used for circulation state.
  See `supabase/migrations/` for schema and `~/.gstack/projects/matured-H-on/
  brandon-main-eng-review-20260814-013000.md` for the full design.
- **Catalog metadata lives in Supabase too**, as of 2026-08-14 (T12) —
  `js/catalog-data.js` is gone; `public.items` now holds title/cover/
  description columns alongside the copies_total column it already had.
  `honFetchCatalog()` in `circulation.js` populates the `HON_CATALOG`
  global once per page load (every page reading it now awaits that first).
  Adding a title is done through `admin.html`'s Catalog section, not by
  editing a file. Also closed a real gap this uncovered: `items` had been
  completely empty since T1 — nobody had ever actually checked out a real
  title before this; every "1 copy in the collection" display had been
  running on a client-side fallback default, not a real database row.
- **Covers are real photographed scans** of actual magazines (BURST, FRUITS,
  Lightning, etc.), stored in `images/covers/`. An earlier version of this
  document said covers were typographic placeholders specifically to avoid
  copyright exposure — that's no longer accurate and was corrected on
  2026-08-14. Real scans are used, with the copyright/legal exposure this
  creates consciously acknowledged and accepted (see the /office-hours
  design doc at `~/.gstack/projects/matured-H-on/brandon-main-design-
  20260814-011834.md`, Approach C). Items without a real scan on file fall
  back to a typographic placeholder card automatically — that fallback
  still exists in code, it's just no longer the primary/intended state.
- **Nav markup is injected by JS, not duplicated per page.** `main.js` builds
  the black-circle button and overlay menu once and prepends it to every
  page's `<body>`. If the nav list ever needs to change, it's a one-file edit.
- **Design language is split by page function**, both deliberately CDG-derived
  but from different CDG references:
  - Marketing pages (Home, About, How It Works, Membership, Support): bold
    black/cream/red editorial voice (CDG ad/literature direction).
  - Archive + item pages: the cdgcdgcdg.com shop reference — scattered
    floating objects, hover-to-pop interaction, minimal white space, and now
    (item page) a repeating logotype wallpaper behind the product layout.
- **Splash (`index.html`) is intentionally separate from `home.html`.** This
  was a deliberate swap partway through the project: the splash needs to be
  whatever loads by default, so it had to become `index.html`, which pushed
  the original homepage content to `home.html`.

---

## Backend build (T1-T16, complete as of 2026-08-14)

The `/plan-eng-review` 16-task plan is fully implemented and pushed:

- **Circulation**: real Supabase-backed checkout/return/queue, row-locked
  against overselling (T2), batched status fetch (T7), overdue soft
  enforcement (T8), in-app queue notifications on return (T13).
- **Accounts**: magic-link sign-in (T5), 5-card invite system with a real
  redeem flow (T9), RLS own-rows-only privacy (T3).
- **Catalog**: metadata migrated from a static JS file into Supabase,
  admin-editable (T12) — also the migration that surfaced `items` had
  been empty since T1, meaning no real checkout had ever succeeded
  before that point.
- **Admin**: `admin.html` (T11) — issue cards, force-return loans, ban
  members, add/edit catalog titles. Gated server-side by
  `profiles.is_admin`, not by the page being unlinked.
- **Hardening**: per-user rate limiting on every member-facing write RPC
  (T14).
- **Tests**: 55 Vitest unit tests for `circulation.js` (T15, `bun run
  test`); SQL-based E2E scripts under `tests/e2e/` for the checkout race
  condition and RLS enforcement (T16), run manually via the Supabase SQL
  Editor since real two-account browser automation would have needed
  either a test-email service or the Supabase service role key.

See `supabase/migrations/` for the full schema/RPC history and
`~/.gstack/projects/matured-H-on/brandon-main-eng-review-20260814-013000.md`
for the original design doc.

---

## Completed this session

- Rebuilt from a single-page CDG-editorial concept into the current
  multi-page structure (Home, About, Archive, How It Works, Membership,
  Support, item detail).
- Built the working circulation demo: checkout / return / join queue / leave
  queue, persisted via `localStorage`, shared across the shelf and item pages.
- Replaced the sticky top nav with the black-circle + fullscreen overlay menu
  pattern (matching the cdgcdgcdg.com reference) — injected via JS site-wide.
- Rebuilt the Archive from a bordered grid into a scattered, vertically
  scrolling shelf with seeded-random layout, hover-to-pop (now scale 1.16x +
  7° diagonal twist + lift), and click-through to individual item pages.
- Built the splash screen: a flickering grid of 本, continuous random flicker
  (no ramp-down, no single "winner" tile — every tile is clickable), spaced
  tiles with a dark gutter between them.
- Rebuilt the item detail page around the CDG product-page reference: fixed
  repeating-kanji wallpaper background, stacked title block, spec list with
  square markers, large bold CTA, and a two-dot cover/detail toggle.
- Full copy pass to remove every em dash / en dash across all pages and the
  catalog descriptions, replacing with natural sentence structure or the
  middot (·) already used elsewhere for label separators.
- Trimmed the homepage copy significantly for a more minimal, type-led feel.
- Verified: all JS files pass `node --check`, all HTML tags balance, no dead
  internal links.

---

## Known limitations (by design, worth saying out loud in the presentation)

- ~~No real backend~~ — **outdated as of 2026-08-14.** Checkout/return/queue
  now run against a real shared Supabase backend with real accounts (RLS
  own-rows-only). See `/plan-eng-review` T1-T5.
- Membership page now has a real sign-in form (email magic link, T5) and a
  real card-redemption flow (T9): enter a code + email, the code is
  validated against the DB before any email is sent, and redeem_card claims
  it (minting 5 new cards) once the user comes back signed in from the
  magic link. The card dashboard now shows real issued/unused cards for the
  signed-in user instead of a hardcoded mockup. The waitlist form and the
  support/donation form are still non-functional mockups with a fake
  confirmation message — clearly labeled as demo-only in the copy.
- Covers are real photographed scans of actual magazines, not typographic
  placeholders — a deliberate, risk-aware choice (see above), not a gap.

---

## Suggested next steps (not yet done)

- [ ] No logo yet beyond the 本 kanji as logotype — fine as-is per your
      original direction ("logo will come later"), but worth deciding before
      final submission whether that's the permanent mark.
- [ ] Mobile pass: the Archive's scattered shelf falls back to a simple
      stacked column under 760px and the item page hasn't been specifically
      tested at narrow widths with the new wallpaper background — worth a
      quick check.
- [ ] Team member names/roles on the About page are still generic placeholder
      titles (Founder, Archivist, Community, Systems) — swap in your actual
      teammates before submission if the rubric expects real names.
- [ ] Decide if you want real teammate photos/bios or keep it role-based.
- [ ] No accessibility pass yet (keyboard nav through the overlay menu, focus
      states, alt text equivalents for the typographic covers).
- [ ] The presentation deck (PowerPoint) is a separate deliverable your
      teammates are handling — this site doesn't cover that.

---

## Version history (zips shared this session)

V2 → V6, each adding: trimmed homepage copy → splash screen → splash routing
fix (→ home.html, then → catalog.html) → dropped red-winner mechanic, added
gaps and continuous flicker → dropped em dashes, Archive opens straight on
shelf → item page CDG product-layout rebuild → shelf hover twist increase.
