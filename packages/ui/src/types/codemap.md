# packages/ui/src/types/

## Responsibility
Defines shared TypeScript contracts for UI state, API payloads, and component props.

## Design
Type-only boundary; favors discriminated unions and narrow interfaces over runtime logic.

## Flow
Other modules import these definitions at compile time to type-check events, stores, and view models.

## Integration
Consumed across stores, hooks, components, and lib adapters; no direct runtime side effects.
