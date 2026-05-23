# packages/ui/src/constants/

## Responsibility
Centralizes static constants and default values used by the UI package.

## Design
Immutable exported values prevent magic literals across modules.

## Flow
Modules import constants during render/action execution to keep behavior consistent.

## Integration
Referenced by components, stores, and lib adapters.
