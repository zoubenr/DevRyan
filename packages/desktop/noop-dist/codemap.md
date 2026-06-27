# packages/desktop/noop-dist/

## Responsibility
Contains placeholder/generated distribution artifacts for legacy Tauri packaging paths.

## Design
Generated-artifact bucket with no feature logic ownership. Kept only for compatibility in release automation during Tauri maintenance window.

## Flow
1. Legacy packaging scripts create or reference noop outputs here.
2. Release steps use those outputs to satisfy expected artifact layout.
3. No runtime code imports this directory.

## Integration
- Related only to `packages/desktop` release plumbing.
- Do not implement features here; source changes should go to primary Electron shell (`packages/electron/*`) or shared web/ui modules.
