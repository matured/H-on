# TODOS

## Features

### Community message board (伝言板 / dengonban)

**What:** A shared message board members can post short public notes to — modeled on the Japanese train-station 伝言板 ("dengonban"/"rengonban"): the green chalkboard grid where people left handwritten notes for each other before mobile phones (e.g. "Waiting at the west exit until 6, meet me there — Kenji").
**Why:** Fits 本's whole anti-feed, pre-phone, physical-media premise better than a generic comments section would — it's the same "message left for a stranger to find" idea the whole site is already built around, just applied to member-to-member notes instead of magazines.
**Context:** Reference images gathered 2026-08-19 (Google Images search for "rengonban 伝言板") — real dengonban boards are a green chalkboard/whiteboard ruled into a grid (date/time/message columns), handwritten, physically erased over time. Needs real design/product thought before building: a Supabase table + RLS policy for public writes (rate-limited, since it's the first genuinely public-write surface on the site), a UI treatment that reads as "chalkboard" without just being a comments widget, and a moderation story (report/hide, since there's no moderation tooling on the site yet beyond admin.html's member management).
**Effort:** L
**Priority:** P3
**Depends on:** None

## Security

### Rate-limit the public waitlist insert

**What:** membership.html's waitlist form writes to `waitlist_requests` via a bare anon-role `insert` RLS policy (`with check (true)`) — no CAPTCHA, no per-IP/session throttling. `check_rate_limit()` already exists (supabase/migrations/20260814210000_rate_limiting.sql) but is only wired into check_out/return_item/join_queue/leave_queue/redeem_card, not this insert path.
**Why:** Flagged by /ship's red-team review on the admin waitlist panel (2026-08-21): now that submissions are readable in-app (`admin_list_waitlist`, capped at 500 rows as a stopgap), an unbounded flood of anon writes is a real nuisance vector against the admin panel, not just inert rows in an unreadable table.
**Context:** Would mean routing the insert through a rate-limited RPC instead of a raw client-side `.insert()`, which changes the shipped membership.html form's write path — bigger and riskier than the panel work it was found alongside, so deferred rather than bundled in.
**Effort:** M
**Priority:** P2
**Depends on:** None

### Cap admin_list_profiles() and admin_list_loans() the same way admin_list_waitlist() is capped

**What:** `admin_list_waitlist()` (supabase/migrations/20260821000000_admin_list_waitlist.sql) caps its result at 500 rows so unbounded growth can't blow up the admin page's render. The two older sibling RPCs, `admin_list_profiles()` and `admin_list_loans()` (supabase/migrations/20260814180000_admin_rpc.sql), have no such limit.
**Why:** Flagged by /ship's Claude adversarial review (2026-08-21) as the same failure class, not introduced by this diff. Lower urgency since both only grow via authenticated member actions, not open anon writes like the waitlist table — but inconsistent with the standard just set.
**Effort:** S
**Priority:** P3
**Depends on:** None

## Design

### Decide on a permanent brand mark

**What:** Decide whether the 本 kanji-as-logotype is the permanent identity mark, or whether the sketched "call number" lockup concept should be applied.
**Why:** No logo exists yet beyond the kanji; worth locking in at some point.
**Context:** A candidate identity system (a "call number" lockup built from the existing glyph, not a new icon) was sketched as a design spec on 2026-08-16 but never applied to the site. See PROJECT_NOTES.md.
**Effort:** M
**Priority:** P2
**Depends on:** None

### Finish inline-style extraction on membership.html and admin.html

**What:** Convert remaining scattered `style="..."` attributes on `membership.html` and `admin.html` to CSS classes, matching the pass already done on the other pages.
**Why:** Consistency with the rest of the codebase's token system; these two pages got the accessibility fixes but not the full design cleanup pass.
**Context:** See "Completed 2026-08-16" in PROJECT_NOTES.md — every other page was converted, these two were explicitly deferred.
**Effort:** S
**Priority:** P3
**Depends on:** None

## Content

### Swap placeholder team names/roles on About page

**What:** Replace the generic role titles (Founder, Archivist, Community, Systems) on about.html with real names/roles whenever the team behind the project is settled.
**Why:** Currently placeholder content; decide real names/photos vs. staying role-based.
**Context:** See PROJECT_NOTES.md "Suggested next steps."
**Effort:** S
**Priority:** P3
**Depends on:** None

## Completed

### Add an admin-visible waitlist panel

**What:** membership.html's waitlist form was already writing to a real `waitlist_requests` table, but nothing could read it back — no select policy, no admin UI, no notification of any kind. Added an `admin_list_waitlist` RPC (gated by `is_admin()`, same pattern as the other admin reads) and a "Waitlist" panel on admin.html listing name/email/note/submitted date for every signup.
**Why:** The founder had no way to know someone had signed up short of opening the Supabase dashboard directly.
**Context:** supabase/migrations/20260821000000_admin_list_waitlist.sql, js/circulation.js's `honAdminListWaitlist()`, admin.html's `honRenderWaitlistTable()`. True push notification (email/SMS on submit) is still open — would need a DB webhook or trigger, not yet built.
**Effort:** S
**Priority:** P2
**Depends on:** None
**Completed:** v0.0.2.0 (2026-08-21)

### Add keyboard focus trap to the fullscreen nav overlay

**What:** The black-circle → fullscreen overlay menu didn't trap focus while open — Tab could reach page content sitting behind it, and the overlay's own links stayed tabbable even while closed and transformed off-screen. Escape-to-close already worked (the earlier TODO item describing it as missing was stale).
**Why:** Real accessibility gap called out in the 2026-08-16 accessibility pass. Fixed using the `inert` attribute: everything except the overlay is made inert while it's open (removes focus trap + AT-hiding in one attribute, no manual Tab-cycling keydown handler needed), focus moves to the first link on open and back to the trigger button on close, and the trigger's `aria-expanded`/`aria-label` now reflect state.
**Context:** js/main.js's `honInjectNav()`. New regression tests in tests/e2e/nav-overlay-focus.spec.js.
**Effort:** S
**Priority:** P3
**Depends on:** None
**Completed:** v0.0.1.0 (2026-08-19)

### Fix corner brand mark 3D spin + add per-magazine hover variation

**What:** Fixed the site-wide corner kanji mark's rotation (was rendering flat, not 3D; briefly disappeared during half the cycle after the first fix attempt) and gave each catalog card its own hover tilt/scale/lift instead of one shared motion.
**Why:** The 3D spin never actually had depth (perspective was set on the wrong element), and a follow-up CSS custom-property shadowing bug meant the new per-item hover variation was computed correctly in JS but never reached the screen.
**Context:** Caught and fixed via /review-animations plus a ship-workflow adversarial review; see css/style.css, js/browse.js, js/main.js and the new tests in tests/e2e/.
**Effort:** M
**Priority:** P1
**Depends on:** None
**Completed:** v0.0.1.0 (2026-08-19)
