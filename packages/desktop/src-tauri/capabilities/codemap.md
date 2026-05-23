# packages/desktop/src-tauri/capabilities/

## Responsibility
Defines Tauri capability/permission manifests for the legacy desktop shell.

## Design
Static declarative config files describing allowed native operations and window/runtime permissions for Tauri.

## Flow
1. Tauri build loads capability descriptors from this directory.
2. Runtime enforces declared permissions for commands/windows.
3. Capability changes affect only Tauri behavior, not Electron.

## Integration
- Consumed by: `packages/desktop/src-tauri/*` build/runtime.
- Not used by primary desktop shell (`packages/electron/*`).
- For new desktop features, implement in Electron and shared UI APIs, not here.
