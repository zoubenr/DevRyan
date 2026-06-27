# packages/ui/src/lib/i18n/

## Responsibility
Internationalization utilities (locale resolution, message lookup, formatting).

## Design
Message-key based translation layer with locale fallback behavior.

## Flow
Components request translated strings via helpers/hooks using active locale context.

## Integration
Integrated with settings, message catalogs, and text-heavy views.
