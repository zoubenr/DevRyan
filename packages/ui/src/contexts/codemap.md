# packages/ui/src/contexts/

## Responsibility
Defines React context providers for cross-cutting runtime state.

## Design
Provider wrappers expose stable context values and avoid prop-drilling.

## Flow
Top-level providers initialize context, descendants read via custom hooks.

## Integration
Used by app bootstrap, shared components, and store-backed hooks.
