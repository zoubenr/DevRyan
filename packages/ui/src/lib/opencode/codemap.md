# packages/ui/src/lib/opencode/

## Responsibility
Client integration layer for OpenCode HTTP/SSE APIs and runtime conventions.

## Design
API-wrapper modules normalize request/response shapes and streaming event handling.

## Flow
UI actions call client methods; SSE events are decoded and forwarded to sync/stores.

## Integration
Core dependency for chat/session/settings workflows and cross-runtime parity.
