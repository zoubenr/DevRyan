# packages/ui/src/lib/theme/

## Responsibility
Implements the shared theming system (token resolution, mode selection, typography hooks).

## Design
Semantic-token architecture separates design intent from concrete color values.

## Flow
App startup and settings changes resolve active theme/mode, then update CSS variables and classes.

## Integration
Integrated by styles, Settings UI, and all token-aware components.
