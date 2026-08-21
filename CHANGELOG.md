# Changelog

All notable changes to this project are documented here.

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
