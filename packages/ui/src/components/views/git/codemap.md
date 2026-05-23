# packages/ui/src/components/views/git/

## Responsibility
Git-focused view components for repository status, diffs, and related workflows.

## Design
View modules orchestrate smaller components and domain hooks for git operations.

## Flow
Route/view entry reads git state via hooks and renders panels/actions.

## Integration
Depends on lib/git, stores, and shared UI primitives.
