# packages/web/server/lib/skills-catalog/

## Responsibility
Catalog/discovery/install pipeline for agent skills from curated Git sources and ClawdHub registries.

## Design
- **Barrel export API** (`index.js`) groups cache, source parsing, scanning, and install operations.
- **Pluggable source model**: generic repository scanner/installer plus dedicated `clawdhub/` provider implementation.
- **Caching layer** reduces repeated remote scans for identical source/query tuples.

## Flow
1. Caller resolves source string via `parseSkillRepoSource` or ClawdHub IDs.
2. Scan path fetches metadata/manifests and normalizes skill entries.
3. Install path downloads/clones skill content and writes into configured skill directory.
4. Cache stores/retrieves scan outputs to speed repeated requests.

## Integration
- Consumed by OpenCode skill management routes/runtime.
- Depends on git/network utilities and filesystem writes.
- Integrates external registries: GitHub-like repos and ClawdHub API/download endpoints.
