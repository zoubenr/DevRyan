# packages/ui/src/components/sections/plugins/

## Responsibility
Read-only Settings section for existing OpenCode plugin configuration and plugin files.

## Design
- Split Settings section with a grouped sidebar and detail page.
- Sidebar groups user/project config entries and user/project plugin files.
- Page content displays metadata only; no create, edit, delete, registry, update, or reload controls.

## Flow
Settings view loads `usePluginsStore` when the Plugins page is active. The store calls `GET /api/config/plugins` for the active directory and exposes stable read-only lists to the sidebar/page.

## Integration
Consumes shared plugin API types, `usePluginsStore`, and shared Settings layout primitives. Backend parity is provided by web server routes and VS Code bridge routing.
