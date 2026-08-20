# TODOS

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

### Add keyboard focus trap + Escape handling to the fullscreen nav overlay

**What:** The black-circle → fullscreen overlay menu (injected by js/main.js on every page) doesn't yet trap focus or close on Escape.
**Why:** Accessibility gap called out explicitly in the 2026-08-16 accessibility pass as not yet covered.
**Context:** See "Completed 2026-08-16" in PROJECT_NOTES.md, "Not yet covered" note.
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

### Fix corner brand mark 3D spin + add per-magazine hover variation

**What:** Fixed the site-wide corner kanji mark's rotation (was rendering flat, not 3D; briefly disappeared during half the cycle after the first fix attempt) and gave each catalog card its own hover tilt/scale/lift instead of one shared motion.
**Why:** The 3D spin never actually had depth (perspective was set on the wrong element), and a follow-up CSS custom-property shadowing bug meant the new per-item hover variation was computed correctly in JS but never reached the screen.
**Context:** Caught and fixed via /review-animations plus a ship-workflow adversarial review; see css/style.css, js/browse.js, js/main.js and the new tests in tests/e2e/.
**Effort:** M
**Priority:** P1
**Depends on:** None
**Completed:** v0.0.1.0 (2026-08-19)
