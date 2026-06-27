# packages/ui/src/lib/diff/

## Responsibility
Diff formatting and view-model helpers for file/patch presentation.

## Design
Adapter utilities convert raw diff payloads into renderable chunks.

## Flow
Git/session data enters helpers, then feeds diff viewers and summary components.

## Integration
Integrated by git views and any change-review surfaces.
