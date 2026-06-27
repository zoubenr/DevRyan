# packages/ui/src/components/auth/

## Responsibility
Authentication UI components for login, token/device flows, and auth prompts.

## Design
Auth flows broken into small step components with explicit status transitions.

## Flow
Auth events from API/client update local/auth store state and rerender controls.

## Integration
Integrated with lib/opencode/github auth endpoints and settings views.
