# packages/desktop/src-tauri/src/

## Responsibility
Native Rust implementation for the legacy Tauri shell runtime: lifecycle, command handlers, menus/window control, sidecar orchestration, and remote SSH management.

## Design
- `main.rs` is a large orchestration entrypoint coordinating app state, command registration, and event dispatch.
- `remote_ssh.rs` implements a dedicated SSH domain model with typed config structs, phase/status enums, monitor loops, and reconnect logic.
- Uses `tauri::Emitter` events to publish runtime status back to the webview.

## Flow
1. App boot creates windows/menu + runtime state.
2. Webview calls into Rust commands.
3. Commands launch/manage child processes (sidecar/ssh), update shared state, and emit `openchamber:*` events.
4. Quit/update paths perform guarded shutdown based on active-risk flags.

## Integration
- Depends on Tauri plugins (shell/updater/etc.) and system process/network primitives.
- Receives UI intents from shared renderer.
- Emits state consumed by desktop UI for tunnels, scheduled tasks, and host lifecycle status.
