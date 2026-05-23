# packages/ui/src/lib/theme/themes/

## Responsibility
Defines concrete theme palettes/token sets consumed by the UI theming engine.

## Design
Theme-per-file exports with semantic token naming rather than component-specific colors.

## Flow
Theme loader selects a palette, resolves token maps, and injects CSS variable values.

## Integration
Used by lib/theme and rendered globally through app/style entrypoints.
