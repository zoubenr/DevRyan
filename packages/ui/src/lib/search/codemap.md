# packages/ui/src/lib/search/

## Responsibility
Search utilities for filtering/ranking sessions, files, or command results.

## Design
Pure query helpers keep search behavior deterministic and reusable.

## Flow
Inputs (query + candidates) are transformed into ranked/filtered output lists.

## Integration
Used by sidebar, command palettes, and selection UIs.
