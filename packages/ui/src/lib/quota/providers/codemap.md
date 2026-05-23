# packages/ui/src/lib/quota/providers/

## Responsibility
Provider-specific adapters for usage/quota data normalization.

## Design
Strategy-style provider modules map heterogeneous quota payloads to a common model.

## Flow
Quota fetch selects adapter by provider and returns normalized usage data.

## Integration
Used by lib/quota and usage settings sections.
