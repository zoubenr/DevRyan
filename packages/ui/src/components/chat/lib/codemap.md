# packages/ui/src/components/chat/lib/

## Responsibility
Utility layer for chat-specific data shaping and rendering helpers.

## Design
Pure helper modules isolate formatting/grouping logic from React components.
- `selectionClipboard.ts` normalizes native selection-copy text from chat message DOM selections.

## Flow
Chat components pass message/session state through helpers before rendering.

## Integration
Used by chat hooks, message rows, and composer/scroll behaviors.
