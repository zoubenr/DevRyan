# packages/ui/src/components/views/

## Responsibility
Top-level view containers used by app routes/tabs (chat, settings, git, etc.).

## Design
Container components coordinate layout regions and feature module composition.

## Flow
Navigation selects a view; view binds data hooks and renders feature sections.

## Integration
Connected to router/state stores and feature component trees.
