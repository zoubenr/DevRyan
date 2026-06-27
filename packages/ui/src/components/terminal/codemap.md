# packages/ui/src/components/terminal/

## Responsibility
Terminal rendering components built on the shared terminal integration layer.

## Design
Separates transport/session logic from terminal viewport and control widgets.

## Flow
Terminal session state and websocket events feed terminal views and interaction handlers.

## Integration
Uses lib/terminal plus session/state hooks and shared UI controls.
