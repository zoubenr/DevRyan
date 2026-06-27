# packages/web/server/lib/security/

## Responsibility
Request-level security helpers for cookie token extraction, origin allowlisting, and explicit WebSocket upgrade rejection responses.

## Design
- `createRequestSecurityRuntime` is dependency-injected so origin policy can include persisted settings (`publicOrigin`).
- Cookie parsing and origin checks are strict/defensive; malformed values fail closed.
- WebSocket rejection writes explicit HTTP response bytes before socket destroy for predictable client diagnostics.

## Flow
1. Caller reads `oc_ui_session` token from request cookies for UI-authenticated channels.
2. Origin validator builds candidate origins from host/forward headers plus configured public origin.
3. Disallowed upgrades are terminated with status-specific plaintext response.

## Integration
- Used by websocket and sensitive API entrypoints in the web server runtime.
- Depends on settings persistence readers to include runtime-configured origin aliases.
