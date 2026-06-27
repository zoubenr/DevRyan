# packages/ui/src/lib/worktrees/

## Responsibility
Worktree/repository-context helpers for multi-directory workflows.

## Design
Utilities normalize worktree identifiers, switching semantics, and cached primary-root/root-branch lookups.

## Flow
Directory context changes are processed and propagated to session/navigation state.
Git root and root-branch reads use bounded in-memory caches with explicit invalidation after worktree mutations.

## Integration
Integrated with git/session modules and project selectors.
