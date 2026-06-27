# Fix New Chat Cross-Project Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New chats created for a project other than the currently mounted project should reliably load the selected project, show the fresh chat, and stream agent responses in both plan mode and normal mode.

**Architecture:** Treat the session's own directory as the source of truth for chat rendering and message sending. Avoid reading messages, status, pagination, and materialization through the previously active directory-scoped sync instance during the draft-to-session handoff.

**Tech Stack:** React, TypeScript, Zustand, DevRyan sync layer, `@opencode-ai/sdk/v2`, Bun validation.

---

## Current Evidence

The relevant code paths are:

- `packages/ui/src/sync/session-ui-store.ts`: draft creation, `sendMessage`, `setCurrentSession`
- `packages/ui/src/sync/session-actions.ts`: `createSession`, optimistic send, directory registration
- `packages/ui/src/sync/use-sync.ts`: directory-scoped message loading and pagination
- `packages/ui/src/sync/sync-context.tsx`: child stores, directory bootstrap, session/message hooks
- `packages/ui/src/components/chat/ChatContainer.tsx`: current-session message/status reads and materialization trigger
- `packages/ui/src/components/chat/ChatInput.tsx`: plan-mode capture and draft target selection

The suspected failure mode is a race/scoping bug:

1. A draft is opened while DevRyan is the active directory.
2. The user targets a different project.
3. `sendMessage` creates the OpenCode session in the target directory.
4. `setCurrentSession` switches the directory, but React has not yet remounted/re-scoped all current-directory hooks.
5. `ChatContainer` reads messages/status/materialization via `useSync()` and `useSessionMessageRecords(currentSessionId)` without passing the created session directory.
6. The UI can render an incomplete/old pagination state such as "Load older messages" while the fresh session's live events are routed to a different child store.

The fix should prove this path with tests first, then make the chat surface session-directory-aware.

## File Responsibilities

- Modify `packages/ui/src/sync/session-ui-store.ts`
  - Preserve the created session directory immediately during draft send.
  - Ensure draft-to-session handoff has an authoritative directory before routing messages.

- Modify `packages/ui/src/sync/sync-context.tsx`
  - Add or expose a lightweight hook/helper to resolve a session directory from live child stores and current UI hints.
  - Keep existing current-directory hooks intact for other surfaces.

- Modify `packages/ui/src/sync/use-sync.ts`
  - Add a directory-aware load/materialization API or companion hook so a component can materialize a session in its own directory rather than only the provider's current directory.

- Modify `packages/ui/src/components/chat/ChatContainer.tsx`
  - Resolve `currentSessionDirectory`.
  - Pass that directory to message/status/session hooks.
  - Use directory-aware materialization and "load older" calls.

- Modify targeted tests under `packages/ui/src/sync/` and/or add component-level tests if existing harnesses support it.

## Task 1: Reproduce the Cross-Project Race in a Focused Sync Test

**Files:**
- Add or modify: `packages/ui/src/sync/session-ui-store.test.js`
- Add or modify: `packages/ui/src/sync/session-materializer.test.ts`

- [ ] Add a test named `creates draft session with selected project directory before message routing`.

Test shape:

```ts
// Arrange current app directory as "/repo/DevRyan".
// Arrange a new draft targeting "/repo/OtherProject".
// Mock createSession to return { id: "ses_other", directory: "/repo/OtherProject" }.
// Send the first message.
// Assert:
// - currentSessionId is "ses_other"
// - getDirectoryForSession("ses_other") resolves "/repo/OtherProject"
// - opencodeClient.setDirectory was called with "/repo/OtherProject"
// - the prompt route receives directory "/repo/OtherProject"
```

- [ ] Add a materializer test named `does not fail with loader not ready when session directory is known`.

Test shape:

```ts
// Register a materializer for "/repo/OtherProject".
// Do not register one for "/repo/DevRyan".
// Call the new directory-aware materialization helper for "ses_other".
// Assert the "/repo/OtherProject" loader is called and materialization ends at "firstPageLoaded".
```

- [ ] Run the focused tests and confirm they fail before implementation.

Run:

```bash
bun run --cwd packages/ui test session-ui-store.test.js session-materializer.test.ts
```

Expected: failures showing the session is being resolved through the current directory or lacks a ready loader.

## Task 2: Make Session Directory Resolution Explicit

**Files:**
- Modify: `packages/ui/src/sync/sync-context.tsx`
- Modify: `packages/ui/src/sync/sync-refs.ts`
- Modify: `packages/ui/src/sync/session-ui-store.ts`

- [ ] Add a pure resolver that can answer "which directory owns this session id?" from:
  - explicit directory hint
  - live child stores
  - routing index, if exposed safely
  - session `directory` field
  - worktree metadata attachment

- [ ] Keep the resolver narrow. It must not fall back to arbitrary historical sessions before checking live child stores.

- [ ] Update `getDirectoryForSession(sessionId)` to use the resolver and return the target directory for freshly created sessions as soon as `createSession` returns.

- [ ] Make `setSessionDirectory(sessionId, directory)` real again, but scoped: it should store a local session-directory hint map only for sessions whose authoritative sync row has not arrived yet. Once the session exists in a child store, live state wins.

- [ ] In `createSession`, after `sessionDirectory` is computed, call both:

```ts
registerSessionDirectory(session.id, sessionDirectory)
useSessionUIStore.getState().setSessionDirectory(session.id, sessionDirectory)
```

Expected outcome: a new session has an immediate directory owner before SSE/session bootstrap catches up.

## Task 3: Add Directory-Aware Materialization and Pagination

**Files:**
- Modify: `packages/ui/src/sync/use-sync.ts`
- Modify: `packages/ui/src/sync/session-materializer.ts`

- [ ] Add a directory parameter to public materialization/loading methods without breaking existing callers:

```ts
ensureSessionRenderable(sessionID: string, options?: { directory?: string; force?: boolean }): Promise<boolean>
loadMore(sessionID: string, options?: { directory?: string }): Promise<void>
```

- [ ] When a directory override is provided, use `childStores.ensureChild(directory)` and `opencodeClient.getScopedSdkClient(directory)` for `session.get`, `session.messages`, metadata, optimistic merge, and cache keys.

- [ ] Preserve existing current-directory behavior when no directory override is passed.

- [ ] Ensure `loadOlderMessages(sessionID, directory)` in `session-materializer.ts` calls the registered materializer for the target directory and never silently retries against the previous directory.

- [ ] Add a regression test where only the target directory has a registered loader.

Expected outcome: "Load older messages" and initial hydration operate on the owning project directory.

## Task 4: Make ChatContainer Read the Current Session's Directory

**Files:**
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx`

- [ ] Resolve `currentSessionDirectory` using the session directory resolver/hook.

- [ ] Pass `currentSessionDirectory` into all current-session live hooks:

```ts
useSessionMessageCount(currentSessionId ?? "", currentSessionDirectory)
useSessionMessageRecords(currentSessionId ?? "", currentSessionDirectory)
useSessions(currentSessionDirectory)
useSessionStatus(currentSessionId ?? "", currentSessionDirectory)
useDirectorySync(selector, currentSessionDirectory)
```

- [ ] Update `ensureSessionRenderable(currentSessionId)` to pass `{ directory: currentSessionDirectory }`.

- [ ] Update the "load older" callback to pass the same directory.

- [ ] Keep blocking request visibility correct by using the target directory's session list, while retaining cross-directory fallback only where the existing code already intentionally uses `getAllSyncSessions()`.

Expected outcome: after a cross-project draft becomes a session, the chat viewport reads the target project child store even during the render before the global current directory update settles.

## Task 5: Make Draft Send Wait for Target Directory Bootstrap Only Where Needed

**Files:**
- Modify: `packages/ui/src/sync/session-ui-store.ts`

- [ ] After creating the session and resolving `createdDirectory`, ensure the target child store exists before calling `routeMessage`.

- [ ] Keep `waitForWorktreeBootstrap(createdDirectory)` for worktree-specific setup, but do not use it as the only guarantee that the sync materializer exists.

- [ ] If adding a helper such as `ensureDirectorySyncReady(directory)`, make it cheap and idempotent.

- [ ] Preserve plan-mode behavior:

```ts
if (resolvedPlanMode) {
  useSelectionStore.getState().setSessionPlanMode(created.id, true)
}
```

Expected outcome: plan-mode and normal-mode first messages use the same directory-safe pipeline.

## Task 6: Verify UI State Does Not Show False "Load Older Messages"

**Files:**
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx`
- Test if practical: chat timeline/controller tests near `packages/ui/src/components/chat/hooks/`

- [ ] Add or update a test for a new empty/streaming session with no pagination metadata.

Expected assertions:

```ts
historyMeta.complete === true || hasMoreAboveTurns === false
isLoadingOlder === false
```

for a freshly created session before the first assistant response arrives.

- [ ] Ensure the visible "Load older messages" affordance only appears when the target directory loader reports a real cursor for that session.

Expected outcome: the control does not appear because metadata is missing or from another directory.

## Task 7: Runtime Verification

**Files:**
- No source edits unless verification exposes another root cause.

- [ ] Run focused tests:

```bash
bun run --cwd packages/ui test session-ui-store.test.js session-materializer.test.ts
```

- [ ] Run the repository's expected affected validation:

```bash
bun run validate:affected
```

- [ ] Manually verify in the app:
  - active project is DevRyan
  - create a new chat targeting a different project
  - send a normal prompt
  - confirm the target project loads, the user message appears, assistant status becomes busy/streaming, and no false "Load older messages" state appears
  - repeat with plan mode enabled
  - switch back to DevRyan and create a normal DevRyan chat to confirm no regression

## Self-Review Checklist

- [ ] Root cause is verified by a failing test or runtime trace before implementation.
- [ ] No fix relies on prompt/UI policy; core session routing owns the safety.
- [ ] Session live state is read from the session's live directory, not historical/global caches.
- [ ] No broad store selectors or new high-frequency state are introduced.
- [ ] Plan mode and normal mode share the same fixed creation path.
- [ ] Validation covers sync/session behavior and changed UI hooks.
