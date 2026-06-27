# packages/web/server/lib/quota/

## Responsibility
Provider-agnostic quota reporting module for model/provider usage limits, exposing lookup and refresh endpoints.

## Design
- **Provider registry pattern**: runtime resolves configured quota providers and dispatches by `providerId`.
- **Directory-scoped resolution**: routes accept header/query project directory hints and normalize via shared resolver.
- **Error contract discipline**: route layer wraps provider exceptions into HTTP status/error payloads.

## Flow
1. Request hits `/api/quota/providers` or `/api/quota/:providerId`.
2. Route resolves effective working directory (header/query + project resolver).
3. Quota runtime lists providers or fetches provider-specific data (optionally `refresh=true`).
4. Result payload returns provider list/usage snapshot to clients.

## Integration
- Mounted by server runtime and consumed by UI quota features.
- Depends on provider implementations in `quota/providers/**` and utils under `quota/utils/**`.
- Coordinates with project-directory resolution from opencode/project modules.
