# Clear Read Completion Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the green session/sidebar completion indicator once the user reads the completed chat.

**Architecture:** Keep notification read-state and completion lifecycle state in sync at the session UI store boundary. Reading a session should mark unread notifications viewed and clear completed-only green indicators, while preserving actionable plan-proposed and pending-question indicators.

**Tech Stack:** Bun tests, React, TypeScript, Zustand, shared UI sync/session stores.

---

## Root Cause

Selecting a chat currently marks notification rows viewed in `packages/ui/src/sync/session-ui-store.ts:1071`, but the sidebar green dot is also driven by `sessionCompletionIndicator` and `sessionPlanIndicator` in `packages/ui/src/components/session/sidebar/sessionIndicator.ts:77` and `packages/ui/src/components/session/sidebar/sessionIndicator.ts:81`.

Those indicator maps are not cleared when the chat is read. So the notification store can become read while the sidebar still sees either `planState === "completed"` or `hasCompletedStatus === true` and keeps rendering `bg-status-success`.

## Critical Files

**Files modified**

- `packages/ui/src/sync/session-ui-store.ts` — add a focused action that clears read completion indicators and call it from session selection.
- `packages/ui/src/apps/AppEffects.tsx` — make mini-chat presence use the same read cleanup path so external reads clear the green dot too.
- `packages/ui/src/sync/session-ui-store.send.test.ts` or a new focused session UI store test — cover normal and plan completion cleanup.
- `packages/ui/src/components/session/sidebar/sessionIndicator.test.ts` — lock the expected indicator behavior when completion state has been cleared.

**Files read (no edit) for behavior reuse**

- `packages/ui/src/sync/notification-store.ts:140` — existing notification viewed semantics.
- `packages/ui/src/sync/session-ui-store.ts:1033` — current session selection side effects.
- `packages/ui/src/sync/session-ui-store.ts:2537` — plan completion indicator writer.
- `packages/ui/src/sync/session-ui-store.ts:2564` — normal turn completion indicator writer.
- `packages/ui/src/apps/AppEffects.tsx:49` — mini-chat viewed presence bridge.

## Implementation

### Task 1: Add failing store coverage

- [ ] Add a test that seeds `sessionCompletionIndicator` with `session-a`, calls the new read-cleanup action, and expects `sessionCompletionIndicator.has("session-a")` to be `false`.

```ts
useSessionUIStore.setState({
  sessionCompletionIndicator: new Map([
    ["session-a", { messageId: "msg-a", completedAt: 123 }],
  ]),
  sessionPlanIndicator: new Map(),
});

useSessionUIStore.getState().clearReadCompletionIndicators(["session-a"]);

expect(useSessionUIStore.getState().sessionCompletionIndicator.has("session-a")).toBe(false);
```

- [ ] Add a test that seeds `sessionPlanIndicator` with `{ state: "completed" }`, calls the same action, and expects the plan indicator to be removed while `sessionPlanAvailable.get("session-a")` remains `true`.

```ts
useSessionUIStore.setState({
  sessionPlanAvailable: new Map([["session-a", true]]),
  sessionPlanIndicator: new Map([
    ["session-a", { state: "completed", sourceMessageId: "msg-plan" }],
  ]),
  sessionCompletionIndicator: new Map(),
});

useSessionUIStore.getState().clearReadCompletionIndicators(["session-a"]);

const state = useSessionUIStore.getState();
expect(state.sessionPlanIndicator.has("session-a")).toBe(false);
expect(state.sessionPlanAvailable.get("session-a")).toBe(true);
```

- [ ] Add a test that seeds `sessionPlanIndicator` with `{ state: "proposed" }`, calls the same action, and expects the indicator to remain. This prevents clearing a yellow “plan ready” state just because the user opened the chat.

### Task 2: Implement the read cleanup action

- [ ] In `SessionUIState`, add:

```ts
clearReadCompletionIndicators: (sessionIds: string[]) => void
```

- [ ] Implement it near `clearSessionTurnCompletion` in `packages/ui/src/sync/session-ui-store.ts`. It should:

  - Deduplicate and ignore empty IDs.
  - Delete matching entries from `sessionCompletionIndicator`.
  - Delete matching `sessionPlanIndicator` entries only when `entry.state === "completed"`.
  - Preserve `sessionPlanAvailable`, `implementedPlanRequests`, and proposed/implementing plan indicators.
  - Return the previous state when nothing changes, preserving Zustand references on no-op.

### Task 3: Wire cleanup into read paths

- [ ] In `applyCurrentSessionSideEffects`, compute the selected scope once:

```ts
const viewedSessionIds = getSessionIdsWithDescendants([id]);
markSessionsViewed(viewedSessionIds);
get().clearReadCompletionIndicators(viewedSessionIds);
setActiveSession(resolvedDir ?? "", id);
```

- [ ] In `MiniChatPresenceBridge`, when `viewed` is true, clear the same completed indicators for `data.sessionId` after `markSessionViewed(data.sessionId)`. Use the store action directly:

```ts
useSessionUIStore.getState().clearReadCompletionIndicators([data.sessionId]);
```

Keep the existing `setExternallyViewedSession(...)` behavior; it prevents newly arriving completion notifications while the external mini-chat is active.

### Task 4: Lock sidebar behavior

- [ ] Add or update `sessionIndicator.test.ts` with an explicit case that `resolveSidebarIndicator` returns `null` when all completion inputs are cleared:

```ts
expect(resolveSidebarIndicator({
  isRootSession: true,
  isWorking: false,
  hasUnreadStatus: false,
  hasUnreadCompletion: false,
  hasCompletedStatus: false,
  pendingQuestionCount: 0,
  planState: null,
})).toBeNull();
```

- [ ] Keep the existing tests for pending questions, proposed plans, and active sessions unchanged. Those states should still suppress or override completion exactly as they do today.

## Verification

1. Run focused tests:

```bash
bun test packages/ui/src/sync/session-ui-store.send.test.ts packages/ui/src/components/session/sidebar/sessionIndicator.test.ts
```

Expected: all tests pass, including the new read-cleanup cases.

2. Run repo quick validation:

```bash
bun run validate:quick
```

Expected: TypeScript/lint checks for changed files pass.

3. Manual UI check:

Start the app with the existing dev command for the target shell, create or open a session, let a normal task finish so the green dot appears, then click/read that chat. Expected: the green dot disappears after the chat is selected.

4. Manual plan check:

Create a plan, implement it until the plan-completed green dot appears, then click/read that chat. Expected: the green completed dot disappears, but an unimplemented plan-proposed/yellow indicator still remains when the plan has not been implemented.
