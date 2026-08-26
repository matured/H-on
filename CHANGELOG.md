# Changelog

All notable changes to this project are documented here.

## [0.0.7.1] - 2026-08-26

### Fixed
- The Dengonban board panel on the admin page was broken ("Couldn't load the board: structure of query does not match function result type") — `auth.users.email` is `character varying(255)`, not `text`, and `admin_list_dengonban()` was missing the explicit cast every other admin RPC that reads it already has. Bug predates this week's corkboard redesign; nothing had actually exercised this specific function as a real admin until now.

## [0.0.7.0] - 2026-08-26

### Added
- Self-hosted page-view analytics: daily view/visitor counts, top referrers, and top pages, in a new Traffic panel on the admin page. No third-party service, no cookies — a visitor is an anonymous browser-local id, not a real identity, and only external referrers (never internal site navigation) are tracked as a traffic source. admin.html itself isn't counted, and automated/CI traffic never gets logged.

## [0.0.6.2] - 2026-08-25

### Removed
- The doodle-drawing canvas is gone from the compose form — too much visual clutter for what it added. Posting no longer sends doodle data. Existing/legacy notes with a doodle would still render correctly if any existed (none do), since the rendering path and the database column are untouched — only the drawing input was removed.

## [0.0.6.1] - 2026-08-25

### Added
- The board's existing notes now reveal with a staggered entrance on load instead of appearing all at once — reuses the same fade a freshly-posted note already got.
- Dragging the pending note before posting now lifts slightly while held and settles with a small bounce when released, instead of just stopping dead.

## [0.0.6.0] - 2026-08-25

### Added
- The Community Board is now a real corkboard: pick a sticky-note color, drag your note anywhere on the board before posting, and optionally draw a small doodle on it.
- Anyone can leave a note now, not just signed-in members — anonymous posting is rate-limited by its own mechanism (3 posts per 10 minutes per browser), separate from the signed-in member limit.
- Admins can remove a note directly from the board itself (a small × on each note), not just from the separate admin panel — reuses the existing reversible hide, so removed notes stay recoverable from admin.html.

## [0.0.5.2] - 2026-08-24

### Fixed
- The Community Board page's intro copy was a leftover design-rationale blurb ("Modeled on the chalkboard grid...") instead of actual page copy. Replaced with "Community Board".

## [0.0.5.1] - 2026-08-21

### Fixed
- A library card's code now runs through the same HTML-escaping helper the rest of the site uses before it's placed on the membership page, closing an Aikido-flagged `innerHTML` anti-pattern (the code is server-generated hex today, not user input, but this keeps a future card field from becoming exploitable).
- The test workflow's checkout step no longer keeps the job's Git credentials around after checking out the code — it never needed them past that point.

## [0.0.5.0] - 2026-08-21

### Fixed
- The "click or press any key" caption on the splash page is now actually legible — it previously sat directly on the flickering tile grid with too little contrast to read comfortably, especially where it crossed a tile's glyph.

## [0.0.4.0] - 2026-08-21

### Added
- Waitlist requests can now be accepted or declined directly from the admin panel — accepting mints a card and shows the code right there, no more switching to the separate "Issue Card" button. The code stays visible if you come back to the panel later, not just in the moment you accept.

### Fixed
- Closed a gap where a waitlist signup could arrive already marked "accepted" or "declined" without an admin ever acting on it.

## [0.0.3.0] - 2026-08-21

### Added
- The splash page now enters on any keypress, not just clicking a tile or tabbing to it first and pressing Enter/Space — matches the "press any key to continue" pattern.

### Fixed
- Reverse-tabbing (Shift+Tab) on the splash page no longer accidentally triggers site entry before the keystroke finishes.

## [0.0.2.0] - 2026-08-21

### Added
- Signups from the "Ask to be on the list" waitlist form on the Membership page are now visible from the admin panel — name, email, note, and submission date for every request, so a submission no longer requires opening the Supabase dashboard directly to see.

### Fixed
- The email field on waitlist submissions now has a length limit matching its name and note siblings, closing a gap where an unusually long value could degrade the admin panel's layout.

## [0.0.1.0] - 2026-08-19

### Added
- Catalog cards now tilt, scale, and lift by a different amount on hover for each magazine — previously every card used the exact same hover motion.

### Fixed
- The site-wide spinning corner brand mark now actually rotates in 3D instead of spinning flat, and no longer disappears for half of every rotation.
- Hovering a catalog card no longer silently falls back to one shared motion regardless of which magazine it is — the per-item variation now reaches the screen instead of being overridden by a default value declared on the wrong element.
- The catalog hover motion now correctly stays off on touch devices and correctly drops its movement (while keeping the shadow cue) for users with reduced-motion preferences enabled.
