# packages/vscode/

## Responsibility
VS Code extension runtime: hosts DevRyan inside VS Code (sidebar + editor panels), manages OpenCode lifecycle/connectivity, and bridges webview requests to VS Code/OS capabilities.

## Design
- **Extension-host + webview split**:
  - `src/extension.ts`: activation, command registration, provider wiring.
  - `src/ChatViewProvider.ts`, `AgentManagerPanelProvider.ts`, `SessionEditorPanelProvider.ts`: UI container controllers.
- **Bridge router pattern**: `src/bridge.ts` dispatches typed messages to focused runtime handlers (`bridge-*-runtime.ts`) for git/fs/config/system/proxy domains.
- **Connection manager abstraction**: `src/opencode.ts` encapsulates managed/external OpenCode, status transitions, auth header generation, binary detection, and restarts.
- **SSE proxy layer**: extension host mediates streamed events to webview without exposing unrestricted local APIs.
- **Theme/CSP-aware webview bootstrap**: `webviewHtml.ts` generates strict HTML shell with injected runtime config and initial loading state.

## Flow
1. VS Code activates extension and initializes OpenCode manager.
2. Chat/provider webviews are registered; HTML bootstrap is generated with current connection/theme metadata.
3. Webview posts bridge messages → `handleBridgeMessage()` routes to domain handlers.
4. Handlers execute VS Code APIs, local process calls, or proxied OpenCode requests, then return typed responses.
5. Connection updates, theme changes, and session activity are pushed from extension host to webview.

## Integration
- **Depends on**: VS Code extension API, OpenCode CLI/API, shared `@openchamber/ui` webview bundle.
- **Consumes shared UI**: webview app entry under `packages/vscode/webview/*`.
- **Cross-runtime alignment**: mirrors desktop/web contracts via `openchamber:*` events and API-shaped bridge responses.
- **Notable policy choice**: backend GitHub bridge operations are explicitly disabled in this runtime and delegated to native VS Code integrations.
