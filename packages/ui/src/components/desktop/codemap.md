# packages/ui/src/components/desktop/

## Responsibility
Desktop-shell specific UI shims and integration widgets.

## Design
Adapters keep shared React UI shell-agnostic while exposing desktop-only affordances.

## Flow
Desktop signals/capabilities are read, then rendered as optional controls or notices.

## Integration
Connected to preload IPC shims and common UI components.
