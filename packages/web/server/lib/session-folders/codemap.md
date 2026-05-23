# packages/web/server/lib/session-folders/

## Responsibility
File-backed API for session-folder UI state (folder map + collapsed IDs) scoped to the local OpenChamber data directory.

## Design
- Single route module (`routes.js`) keeps contract small: read current blob, write whole blob.
- Writes are atomic (`.tmp` + rename) and payload-size bounded to avoid oversized state abuse.
- Read path is resilient: missing/invalid JSON falls back to empty default structure.

## Flow
1. GET `/api/session-folders` loads `sessions-directories.json` and returns parsed or default payload.
2. POST validates object body and byte size, then writes atomically.
3. Client treats server blob as source of truth for folder organization state.

## Integration
- Mounted by web server route registration and consumed by sidebar/session organization UI.
- Uses `openchamberDataDir` dependency from server bootstrap for runtime-specific storage path.
