# packages/ui/src/lib/terminal/

## Responsibility
Houses terminal module code for the shared UI runtime.

## Design
Organized as small focused modules; public helpers stay thin and keep state outside this folder.

## Flow
Callers import folder modules, pass runtime/store context, receive transformed data or rendered UI fragments.

## Integration
Used by nearby UI surfaces under packages/ui/src and wired through app-level stores/hooks.
