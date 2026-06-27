# packages/web/server/lib/event-stream/

## Responsibility
Real-time transport bridge for OpenCode events: parses upstream SSE envelopes, maintains replayable hubs, and broadcasts to global/directory WebSocket clients.

## Design
- **Protocol module** (`protocol.js`) centralizes frame serialization/parsing constants.
- **Hub + bridge architecture**: global message hub stores replay window; bridge runtimes fan out to connected WS clients.
- **Resilient upstream reader** with reconnect and stall-timeout controls (`upstream-reader.js`).

## Flow
1. Upstream SSE stream emits event envelopes.
2. `parseSseEventEnvelope` normalizes event payloads.
3. Hub appends/replays events and runtime broadcasters push frames to WS clients.
4. Late clients receive buffered replay before live stream continuation.

## Integration
- Called by `server/index.js` when wiring global event routes and WS handlers.
- Feeds UI live session/message state consumers.
- Shares runtime lifecycle with OpenCode watcher/network modules.
