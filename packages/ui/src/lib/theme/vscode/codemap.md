# packages/ui/src/lib/theme/vscode/

## Responsibility
Adapts DevRyan theme tokens to VS Code-compatible color semantics.

## Design
Translation layer maps internal semantic tokens to VS Code host color keys.

## Flow
Theme resolution computes UI tokens first, then this module projects them to host-specific values.

## Integration
Consumed by VS Code runtime integration paths and shared theme utilities.
