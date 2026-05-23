# packages/ui/src/lib/permissions/

## Responsibility
Permission and capability helpers for client-side gating decisions.

## Design
Centralized predicate utilities keep authorization checks consistent.

## Flow
UI asks permission helpers before enabling actions or rendering restricted controls.

## Integration
Used across chat/tools/settings with data from session/auth state.
