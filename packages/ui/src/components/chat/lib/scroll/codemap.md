# packages/ui/src/components/chat/lib/scroll/

## Responsibility
Implements chat scroll management utilities (pinning, restoration, follow behavior).

## Design
Layout-effect oriented helpers avoid paint-time jumpiness during streaming/prepend operations.

## Flow
Before list mutations, helpers capture viewport metrics; after commit, they restore intended scroll.

## Integration
Called from chat hooks/components handling message list updates.
