# packages/ui/src/components/chat/hooks/

## Responsibility
Provides chat-specific hooks for streaming state, follow-scroll, and composer behavior.

## Design
Hooks encapsulate high-frequency logic behind stable APIs for UI components.

## Flow
Chat containers call hooks, hooks subscribe to stores/SSE state, then expose derived flags/actions.

## Integration
Used by chat components and connected to sync stores/lib opencode client.
