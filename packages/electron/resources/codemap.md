# packages/electron/resources/

## Responsibility
Stores static Electron packaging resources (icons, manifests, installer-facing assets).

## Design
Resource-only directory with no runtime source ownership. Files are treated as build inputs consumed by Electron packaging config.

## Flow
1. Build tooling references assets from this folder.
2. Electron packager bundles them into distributables.
3. Running app consumes bundled outputs, not these source files directly.

## Integration
- Consumed by: Electron build/release pipeline.
- Not a logic surface: behavioral changes belong in `packages/electron/main.mjs` and shared UI/server packages.
- For generated outputs, inspect build artifacts rather than editing this folder.
