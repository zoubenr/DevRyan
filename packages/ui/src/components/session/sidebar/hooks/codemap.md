# packages/ui/src/components/session/sidebar/hooks/

## Responsibility
Sidebar-specific hooks for session lists, filters, ordering, and selection behavior.

## Design
Hook utilities keep list logic out of sidebar presentational components.

## Flow
Hooks subscribe to session stores, derive visible rows, and expose actions/callbacks.
Repository-status hooks debounce root-branch refreshes and resolve only projects whose path or known branch changed.

## Integration
Used by session/sidebar components and fed by sync/session stores.
