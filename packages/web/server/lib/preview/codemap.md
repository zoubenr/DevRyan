# packages/web/server/lib/preview/

## Responsibility
Preview proxy runtime utilities for embedded app previews: navigation policy, resource-noise filtering, target/session token handling, and bridge script injection.

## Design
- `proxy-runtime.js` is policy-heavy and framework-aware (Vite/Next/Astro/etc. noise suppression rules).
- Classification helpers are pure functions (`classifyPreviewResourceError`, `classifyPreviewNavigation`) to keep route/websocket layer thin.
- In-page bridge script captures console/runtime signals and forwards them to parent preview shell.

## Flow
1. Incoming preview requests resolve/protect target loopback origins.
2. Navigation events are classified as allow/proxy/external.
3. Resource load failures are filtered to suppress dev-server noise while reporting actionable failures.
4. Injected bridge posts UI/runtime telemetry back to host context.

## Integration
- Consumed by `/api/preview/*` server routes and preview iframe host logic.
- Coordinates with session auth cookies and proxy routing in the main server runtime.
