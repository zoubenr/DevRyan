# packages/ui/src/stores/types/

## Responsibility
Type definitions for Zustand store slices, actions, and shared state shapes.

## Design
Type-first contracts keep store composition explicit and safe.

## Flow
Store implementations import these types to define setters/selectors/actions.

## Integration
Consumed by stores plus hooks/components that depend on typed selectors.
