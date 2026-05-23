# packages/web/server/lib/quota/providers/google/

## Responsibility
Google-specific quota provider implementation for Gemini/Google and Antigravity auth sources (auth source resolution, token refresh, quota/model fetch, normalization).

## Design
- `auth.js` discovers multiple auth sources and OAuth client credentials, including defaults/fallbacks.
- `api.js` owns Google HTTP calls (token refresh + quota/model endpoints).
- `transforms.js` converts bucket/model payloads into canonical quota model usage data.
- `index.js` orchestrates source-specific quota fetches and partial-failure handling.

## Flow
1. `fetchGoogleQuota()` filters to the Gemini auth source; `fetchAntigravityQuota()` filters to the Antigravity auth source.
2. For the selected source, refreshes token when expired and fetches quota/model data.
3. Transforms and merges models into a shared map, recording per-source failures.
4. Returns `configured:false` when that provider's auth source is missing, or best-effort error/success result when it exists.

## Integration
- Invoked via quota provider registry as providers `google` and `antigravity`.
- Uses shared result contract from `quota/utils` and contributes normalized model windows for UI quota display.
