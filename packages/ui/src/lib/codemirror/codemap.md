# packages/ui/src/lib/codemirror/

## Responsibility
CodeMirror integration helpers (extensions, language setup, editor config).

## Design
Editor configuration is modularized for reuse and predictable defaults.

## Flow
Editor components import config builders, instantiate editors, and bind callbacks.

## Integration
Consumed by code-editing surfaces and diff/comment tooling.
