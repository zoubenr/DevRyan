# packages/web/server/lib/github/repo/

## Responsibility
GitHub repository identity resolution layer: parse git remotes and optionally expand to upstream network when origin is a fork.

## Design
- `index.js` normalizes common remote URL formats (SSH/HTTPS) into `{ owner, repo, url }`.
- `fork-detection.js` augments origin repo using Octokit metadata (`parent`/`source`) and deduplicates via normalized repo keys.
- In-memory TTL+LRU-ish cache avoids repeated metadata calls across frequent requests.

## Flow
1. Resolve remote URL from local git directory (`origin` by default).
2. Parse URL into GitHub owner/repo identity.
3. If fork detection is requested, fetch/cached repo metadata and append upstream repos when present.
4. Return network list (origin first) for downstream querying.

## Integration
- Consumed by GitHub integrations that need repo-scoped lookups (status, PR context, quota/status aggregation).
- Depends on git helper `getRemoteUrl` and authenticated Octokit clients from parent GitHub module.
