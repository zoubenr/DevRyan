# packages/cursor-sdk-runtime/

## Responsibility
Shared Cursor SDK runtime for DevRyan hosts. It keeps Cursor model execution, SDK auth discovery, virtual provider discovery, and split SDK/usage credential helpers in one package so web/Electron and VS Code do not duplicate provider behavior.

## Design
- `index.js`: ESM runtime and credential helpers.
- `persistent-worker.mjs`: long-lived Node/Electron-as-Node prompt worker that keeps `@cursor/sdk` imported, caches Cursor agents per session/directory, and multiplexes prompt/cancel events by request id.
- `node-worker.mjs`: one-shot fallback prompt worker retained for startup failures and compatibility tests.
- `plan-card-normalize.js`: normalizes Cursor plan-mode assistant parts so structured plans are promoted into the shared `<!--plan-->` card marker format.
- `index.d.ts`: Type declarations consumed by TypeScript packages.
- SDK auth uses `CURSOR_API_KEY`, then `cursor-acp.key`, then `cursor-acp.token`.
- Usage/quota auth is intentionally separate and only reads `cursor-acp.usageSessionToken`.
- Host runtimes may pass `resolveAgentPrompt` so Cursor prompts include the selected DevRyan agent markdown as synthetic execution context while keeping the visible user message clean.
- Bun and desktop Electron hosts run Cursor prompt work through `node-worker.mjs` instead of the host process. Packaged Electron launches its own executable with `ELECTRON_RUN_AS_NODE=1` and `process.resourcesPath` as cwd so SDK streaming cannot block the Electron main loop and the worker can execute from `app.asar`.
- Cursor virtual provider models advertise text and image input only; PDF and other non-image attachments are blocked with a visible assistant error instead of being silently dropped.
- Cursor SDK model parameters are preserved as DevRyan model variants: reasoning/effort/thinking levels become variant keys, SDK `fast` becomes paired `*-fast` rows, and prompt sends resolve the selected row/variant back to SDK `{ id, params }`.
- Image file parts are forwarded to the Cursor SDK `images` field and preserved on the stored user message for shared UI rendering.
- The Council agent is blocked in Cursor SDK sessions because it requires OpenCode plugin tools such as `council_session`, which the Cursor bridge cannot expose.
- Cursor plan-mode prompts keep the selected concrete model pinned through the runtime contract instead of blocking before the SDK run starts; pinned Cursor Orchestrator plan mode injects direct, non-delegating plan instructions to avoid subagent model switches.
- Runtime status exposes the latest Cursor cancellation attribution so hosts can distinguish explicit user aborts, model-boundary cancellations, and provider/runtime cancellations.

## Integration
- Web/Electron creates the runtime in `packages/web/server/index.js` and intercepts `cursor-acp` prompt sends before the OpenCode proxy.
- Web/Electron merges `getSessionStatus()` into `/api/session/status` so Cursor SDK sessions report live busy/idle state alongside OpenCode sessions.
- VS Code uses the shared credential/status/configure helpers through `packages/vscode/src/bridge-system-runtime.ts`.
