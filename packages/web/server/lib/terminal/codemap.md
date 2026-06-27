# packages/web/server/lib/terminal/

## Responsibility
Terminal transport/runtime utilities for PTY streaming: WebSocket protocol normalization, control frames, rebind rate limiting, and output replay buffering.

## Design
- **Protocol-first design** (`terminal-ws-protocol.js`) defines payload constraints and frame parsing/encoding.
- **Replay buffer primitive** (`output-replay-buffer.js`) supports terminal reattach/resume without full process restart.
- **Runtime wrapper** (`runtime.js`) composes protocol + PTY IO hooks.

## Flow
1. Incoming WS frames are normalized to text/buffer and checked for control tags.
2. Runtime forwards valid input to active PTY channel.
3. PTY output chunks are appended to replay buffer with chunk IDs.
4. Rebinding clients request chunks since last ID to recover missed output.

## Integration
- Used by `/api/terminal/*` routes in server runtime.
- Consumed by `src/api/terminal.ts` adapter + shared terminal UI (`ghostty-web`).
- Coordinates with event-stream/websocket lifecycle in server bootstrap.
