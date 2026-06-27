# packages/desktop/src-tauri/

## Responsibility
Legacy Tauri app package root containing Rust application code, runtime capabilities, and Tauri build configuration.

## Design
- `Cargo.toml` defines native dependencies/plugins.
- `tauri.conf.json` + `tauri.dev.conf.json` define runtime/build targets and app metadata.
- `capabilities/default.json` and plugin configuration bound the command surface.
- `src/` holds command handlers and subsystem state machines (notably remote SSH supervision).

## Flow
1. Tauri runtime loads configuration and initializes app shell.
2. Rust commands/services in `src/` handle webview invocations.
3. Commands manage sidecar, SSH/runtime state, and emit UI events.
4. Build pipeline compiles sidecar and native app artifacts.

## Integration
- Integrated with `packages/desktop/scripts/*` for dev/build automation.
- Shares renderer compatibility contracts with Electron via common `openchamber:*` events.
- Kept for installed-user continuity while Electron is primary.
