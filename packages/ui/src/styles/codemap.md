# packages/ui/src/styles/

## Responsibility
Contains global CSS layers and styling entrypoints for the UI package.

## Design
Centralized style composition with theme variables and Tailwind-driven utility layers.

## Flow
App bootstrap loads these files once; class tokens and CSS vars cascade to all components.

## Integration
Integrated by app entry modules and theme utilities in lib/theme.
