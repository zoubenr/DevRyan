# packages/ui/src/components/chat/lib/turns/

## Responsibility
Contains helpers for turn segmentation and turn-level chat presentation logic.

## Design
Turn-aware transformation utilities normalize raw message sequences into UI-friendly groups.

## Flow
Incoming message arrays are grouped/annotated, then consumed by chat rendering components.

## Integration
Integrated with chat store selectors and message row components.
