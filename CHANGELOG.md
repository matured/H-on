# Changelog

All notable changes to this project are documented here.

## [0.0.1.0] - 2026-08-19

### Added
- Catalog cards now tilt, scale, and lift by a different amount on hover for each magazine — previously every card used the exact same hover motion.

### Fixed
- The site-wide spinning corner brand mark now actually rotates in 3D instead of spinning flat, and no longer disappears for half of every rotation.
- Hovering a catalog card no longer silently falls back to one shared motion regardless of which magazine it is — the per-item variation now reaches the screen instead of being overridden by a default value declared on the wrong element.
- The catalog hover motion now correctly stays off on touch devices and correctly drops its movement (while keeping the shadow cue) for users with reduced-motion preferences enabled.
