# packages/web/

## Responsibility
Web runtime package that ships three surfaces: browser app (Vite bundle), embedded Express server runtime, and `openchamber` CLI entrypoint.

## Design
- **Split runtime model**: UI bootstrap in `src/`, server orchestration in `server/`, operator/automation UX in `bin/`.
- **Adapter boundary**: `src/api/*` implements `@openchamber/ui` runtime API contracts over HTTP/WebSocket endpoints.
- **Composable server internals**: `server/index.js` delegates to focused runtime factories under `server/lib/*` instead of keeping route logic inline.

## Flow
1. `bin/cli.js serve` (or Electron import) calls server bootstrap in `server/index.js`.
2. Server starts OpenCode integration + local APIs (`/api/*`, SSE, WS) and serves web assets.
3. Browser loads `src/main.tsx`, installs runtime APIs via `window.__OPENCHAMBER_RUNTIME_APIS__`, then imports `@openchamber/ui/main`.
4. Shared UI talks to web APIs (terminal, git, files, settings, notifications, GitHub, push, tools).

## Integration
- Exposes package entrypoints: `main`/`types` => `server/index.js`, `bin` => `bin/cli.js`.
- Serves `@openchamber/ui` frontend runtime and consumes `@opencode-ai/sdk` via server-side OpenCode integration.
- Used directly by Electron desktop shell (in-process server boot) and standalone CLI/web deployments.
