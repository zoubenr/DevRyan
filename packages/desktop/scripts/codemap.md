# packages/desktop/scripts/

## Responsibility
Hosts maintenance scripts for legacy Tauri desktop build/release paths.

## Design
Operational helper scripts only. This folder is intentionally limited to compatibility tasks and should not receive new product features.

## Flow
1. CI or workspace invokes legacy desktop script.
2. Script prepares Tauri-specific assets/metadata.
3. Output feeds old installer/update channels still supported in parallel.

## Integration
- Upstream callers: release workflow and `desktop:*` scripts.
- Downstream surfaces: `packages/desktop/src-tauri/*`.
- Primary desktop development remains in `packages/electron/*`; keep this folder maintenance-only.
