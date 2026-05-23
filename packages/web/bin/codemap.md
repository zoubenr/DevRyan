# packages/web/bin/

## Responsibility
Node CLI surface for launching and operating DevRyan/OpenChamber server features (serve lifecycle, tunnel workflows, status/log-style output).

## Design
- **Single-command orchestrator** in `cli.js` with shared output/prompt helpers from `cli-output.js`.
- **Policy-first validation**: hard checks for unsafe browser ports, duration/TTL bounds, and runtime preconditions before prompt UX.
- **Dual-mode output**: human-friendly Clack UI in TTY and deterministic JSON/quiet modes for automation.

## Flow
1. `cli.js` parses argv/env, resolves command mode, and selects output strategy.
2. Commands may start foreground server (`server/index.js`) or call local API endpoints.
3. Tunnel-related commands normalize user input and persist CLI-side profile/state files.
4. Command exit paths map to explicit exit-code constants.

## Integration
- Package `bin` entry (`openchamber`) points here.
- Imports tunnel capability metadata from `server/lib/tunnels/providers/cloudflare.js`.
- Uses same server runtime as Electron/web deployment for behavior parity.
