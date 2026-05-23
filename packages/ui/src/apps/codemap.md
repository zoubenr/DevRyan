# packages/ui/src/apps/

## Responsibility
Hosts app-shell entry compositions for different runtime surfaces.

## Design
Thin composition roots that wire providers, routes, and top-level views.

## Flow
Runtime selects an app entry, mounts providers, then renders feature components.

## Integration
Integrates contexts, stores, styles, and major view modules.
