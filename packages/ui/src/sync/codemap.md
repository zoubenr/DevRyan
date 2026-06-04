# packages/ui/src/sync/

## Responsibility
Implements client-side sync primitives for session/event reconciliation and cache updates.

## Design
Event-reducer style updates with normalized entities and optimistic-safe merge utilities.
Draft persistence helpers (`session-draft-storage.ts`) own localStorage keys and migration for new-chat draft state.
Cursor ACP title repair is isolated in `cursor-title-repair.ts` so the event loop can repair stale provider-error, default, raw-prompt, or generated timestamp titles after successful work without changing chat rendering.
Plan proposal idle settlement is isolated in `plan-idle-settlement.ts` so completed plan cards can clear stale optimistic busy status without changing generic assistant activity rules.
Synthetic session-status compatibility events are normalized in `event-pipeline.ts` before routing/coalescing, terminal assistant status settlement stays provider-neutral and trailing-turn scoped in `event-reducer.ts`, and active-session stale recovery stays scoped to the viewed session in `sync-context.tsx`.

## Flow
SSE/polling events enter reducers, then produce store patches consumed by chat/session UI.

## Integration
Bridges lib/opencode streams with Zustand stores and session/chat components.
