# packages/ui/src/lib/git/

## Responsibility
Git-domain client helpers for status, diffs, and repository operations.

## Design
Thin typed wrappers over server git routes plus formatting/safety helpers for git workflows.

## Flow
Views/hooks request git data, then transform results for tables and diff widgets.

## Integration
Consumed by git views, session context features, and project settings.
