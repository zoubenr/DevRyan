# packages/cursor-sdk-runtime/

## Responsibility
Shared Cursor SDK runtime for DevRyan hosts. It keeps Cursor model execution, SDK auth discovery, virtual provider discovery, and split SDK/usage credential helpers in one package so web/Electron and VS Code do not duplicate provider behavior.

## Design
- `index.js`: ESM runtime and credential helpers.
- `plan-card-normalize.js`: normalizes Cursor plan-mode assistant parts so structured plans are promoted into the shared `<!--plan-->` card marker format.
- `index.d.ts`: Type declarations consumed by TypeScript packages.
- SDK auth uses `CURSOR_API_KEY`, then `cursor-acp.key`, then `cursor-acp.token`.
- Usage/quota auth is intentionally separate and only reads `cursor-acp.usageSessionToken`.

## Integration
- Web/Electron creates the runtime in `packages/web/server/index.js` and intercepts `cursor-acp` prompt sends before the OpenCode proxy.
- Web/Electron merges `getSessionStatus()` into `/api/session/status` so Cursor SDK sessions report live busy/idle state alongside OpenCode sessions.
- VS Code uses the shared credential/status/configure helpers through `packages/vscode/src/bridge-system-runtime.ts`.
