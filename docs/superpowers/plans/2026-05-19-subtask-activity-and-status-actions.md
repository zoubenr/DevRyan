# Subtask Activity And Status Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix intermittent subtask activity rendering for delegated Explorer tasks and remove stray message action buttons from assistant status/skill announcement lines.

**Architecture:** Keep both fixes in the shared chat UI. The subtask issue is a child-session linking and refresh race, so the fix belongs in task session linking and the task tool summary path. The copy-button issue is an assistant message action eligibility issue, so the fix belongs in the inline-action helper and the message body caller.

**Tech Stack:** React, TypeScript, Bun test, shared UI package under `packages/ui`.

---

## Current Evidence

- Screenshot 1 shows an `Agent Task` row with `Subtask activity is unavailable.`, followed by a second `Agent Task` row for the same prompt that has full activity rows and an Explorer subtask link.
- Screenshot 2 shows copy buttons rendered under assistant status lines:
  - `Using Systematic Debugging to trace the profile form value mismatch.`
  - `Using Supabase guidance because this profile data likely comes through Supabase-backed APIs.`
- A red test proved `buildTaskInvocationSignature()` did not change when an existing task received lifecycle timing. That can keep `useEnsureSessionChildren()` from retrying child-session discovery after the first early fetch.
- A red test proved `shouldRenderStandaloneAssistantActionsForTextGroup()` currently treats skill/status announcement text as eligible for standalone copy actions.
- Validation surfaced unrelated/current-worktree type hygiene in `packages/ui/src/components/chat/message/parts/toolRenderUtils.test.ts` and lint hygiene in `packages/ui/src/components/chat/message/parts/ToolPart.tsx`; keep those clean because they block `validate:quick`.
- Repository instruction: do not run git/GitHub commands unless explicitly asked.

## File Structure

- Modify: `packages/ui/src/components/chat/lib/taskSessionLinking.ts`
  - Owns task invocation signatures and child-session assignment.
- Test: `packages/ui/src/components/chat/lib/taskSessionLinking.test.ts`
  - Regression coverage for task refresh signatures.
- Modify: `packages/ui/src/components/chat/message/assistantInlineActions.ts`
  - Owns whether split assistant text groups get standalone message actions.
- Test: `packages/ui/src/components/chat/message/assistantInlineActions.test.ts`
  - Regression coverage for suppressing actions on status announcements.
- Modify: `packages/ui/src/components/chat/message/MessageBody.tsx`
  - Passes rendered text-group content into the action eligibility helper.
- Inspect/modify only if needed: `packages/ui/src/components/chat/message/parts/TaskToolSummary.tsx`
  - Owns the `Subtask activity is unavailable.` fallback copy.
- Inspect/modify only if validation requires it: `packages/ui/src/components/chat/message/parts/ToolPart.tsx`
  - Keep lifecycle helpers scoped correctly and no unused locals.
- Test-only hygiene if validation requires it: `packages/ui/src/components/chat/message/parts/toolRenderUtils.test.ts`
  - Avoid Bun runtime assertion overloads that TypeScript rejects.

## Task 1: Stabilize Current Workspace State

**Files:**
- Modify only if needed: `packages/ui/src/components/chat/message/parts/ToolPart.tsx`
- Modify only if needed: `packages/ui/src/components/chat/message/parts/toolRenderUtils.test.ts`

- [ ] **Step 1: Run focused type-check**

Run:

```bash
bun run --cwd packages/ui type-check
```

Expected: either exit `0`, or only reports files already in the changed-file validation set. If it reports `Cannot find name 'isSuccessfulFinalStatus'`, restore/keep that variable inside `ToolExpandedContent`, where `renderResultContent()` and output rendering close over it.

- [ ] **Step 2: Fix only validation blockers caused by local changed files**

For `toolRenderUtils.test.ts`, use normal one-argument assertions:

```ts
expect(summaries).toHaveLength(1);
expect(summaries[0]?.path).toBe('src/alias.ts');
expect(summaries[0]?.additions).toBe(2);
expect(summaries[0]?.deletions).toBe(1);
```

For `ToolPart.tsx`, remove unused locals only where they are genuinely unused. Do not remove `isSuccessfulFinalStatus` from `ToolExpandedContent`; it is used later by the question/output render branches.

- [ ] **Step 3: Re-run focused checks**

Run:

```bash
bun test packages/ui/src/components/chat/message/parts/toolRenderUtils.test.ts
bun run --cwd packages/ui type-check
```

Expected: tests pass and UI type-check exits `0`.

## Task 2: Prove And Fix Subtask Child-Session Refresh Race

**Files:**
- Modify: `packages/ui/src/components/chat/lib/taskSessionLinking.ts`
- Test: `packages/ui/src/components/chat/lib/taskSessionLinking.test.ts`

- [ ] **Step 1: Write failing regression test**

Add this test under `describe('buildTaskInvocationSignature')`:

```ts
test('changes when an existing task invocation receives lifecycle timing', () => {
  const started = buildTaskInvocationSignature([task('task-1', 0, { taskStartTime: 100 })]);
  const completed = buildTaskInvocationSignature([task('task-1', 0, { taskStartTime: 100, taskEndTime: 250 })]);

  expect(completed).not.toBe(started);
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/ui/src/components/chat/lib/taskSessionLinking.test.ts
```

Expected before the fix: the new test fails because both signatures are `task-1::explorer`.

- [ ] **Step 3: Implement minimal fix**

Change `buildTaskInvocationSignature()` so task timing participates in the refresh key:

```ts
export const buildTaskInvocationSignature = (tasks: TaskSessionInvocation[]): string => {
  if (tasks.length === 0) {
    return 'tasks:0';
  }
  return tasks
    .map((task) => `${task.key}:${task.explicitSessionId ?? ''}:${task.subagentType ?? ''}:${task.taskStartTime ?? ''}:${task.taskEndTime ?? ''}`)
    .sort()
    .join('|');
};
```

- [ ] **Step 4: Verify green**

Run:

```bash
bun test packages/ui/src/components/chat/lib/taskSessionLinking.test.ts
```

Expected: all task-session-linking tests pass.

- [ ] **Step 5: Inspect runtime behavior**

In the browser, reproduce an Orchestrator task that delegates to Explorer. Expected behavior:

- While unresolved/running, the row can show a waiting/resolving state.
- Once child session is created and task timing changes, child-session fetch retries.
- The first task row should link to the child session or show activity rows instead of staying permanently at `Subtask activity is unavailable.`

If it still shows unavailable, inspect `packages/ui/src/components/chat/message/parts/TaskToolSummary.tsx` next. The fallback should remain only for truly finalized, unlinked, no-output task rows after child-session discovery has completed.

## Task 3: Prove And Fix Status Announcement Copy Buttons

**Files:**
- Modify: `packages/ui/src/components/chat/message/assistantInlineActions.ts`
- Test: `packages/ui/src/components/chat/message/assistantInlineActions.test.ts`
- Modify: `packages/ui/src/components/chat/message/MessageBody.tsx`

- [ ] **Step 1: Write failing regression test**

Add:

```ts
test('suppresses split actions on skill status announcement text', () => {
  expect(shouldRenderStandaloneAssistantActionsForTextGroup({
    providerID: 'anthropic',
    shouldShowStandaloneMessageActions: true,
    messageId: 'assistant-1',
    groupStartIndex: 0,
    groupEndIndex: 0,
    lastRenderableTextPartIndex: 0,
    textPartIds: ['skill-status-part'],
    text: 'Using Systematic Debugging to trace the profile form value mismatch.',
  })).toBe(false);

  expect(shouldRenderStandaloneAssistantActionsForTextGroup({
    providerID: 'anthropic',
    shouldShowStandaloneMessageActions: true,
    messageId: 'assistant-2',
    groupStartIndex: 0,
    groupEndIndex: 0,
    lastRenderableTextPartIndex: 0,
    textPartIds: ['skill-guidance-part'],
    text: 'Using Supabase guidance because this profile data likely comes through Supabase-backed APIs.',
  })).toBe(false);
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/ui/src/components/chat/message/assistantInlineActions.test.ts
```

Expected before the fix: the new test fails because the helper returns `true`.

- [ ] **Step 3: Implement minimal helper**

Add a narrow status-announcement detector:

```ts
export const isAssistantStatusAnnouncementText = (text: string | undefined): boolean => {
  const normalized = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim()
    : '';
  if (!normalized || normalized.length > 220) {
    return false;
  }

  const plain = normalized.replace(/[`*_]/g, '');
  if (/^Loading Skill:\s+\S/i.test(plain)) {
    return true;
  }

  return /^Using\s+[A-Z][A-Za-z0-9 /:_-]{1,80}\s+(?:to|guidance because)\s+.+[.!?]?$/.test(plain);
};
```

Call it before provider-specific action logic:

```ts
if (isAssistantStatusAnnouncementText(text)) {
  return false;
}
```

- [ ] **Step 4: Pass text from the message renderer**

In `MessageBody.tsx`, pass the merged text group:

```ts
text: renderPartText,
```

inside the `shouldRenderStandaloneAssistantActionsForTextGroup({ ... })` call.

- [ ] **Step 5: Verify green**

Run:

```bash
bun test packages/ui/src/components/chat/message/assistantInlineActions.test.ts
```

Expected: all assistant inline action tests pass.

## Task 4: Browser Verification On Dev Server

**Files:**
- No planned edits.

- [ ] **Step 1: Confirm dev server is current**

Use the already running dev server at:

```text
http://127.0.0.1:3001
```

If the browser is stale after a build restart, reload the page.

- [ ] **Step 2: Verify status announcement actions**

Open a session containing skill/status announcements. Expected:

- The visible text still renders.
- No standalone copy button appears directly under `Using ...` or `Loading Skill: ...` status-only lines.
- Normal final assistant answers still have copy/TTS/turn footer actions.

- [ ] **Step 3: Verify subtask row**

Trigger Orchestrator delegation to Explorer. Expected:

- No permanently stranded `Subtask activity is unavailable.` row before the working duplicate.
- The Explorer subtask link opens the child session.
- Child tool summary rows appear after child messages are fetched.

If this cannot be reproduced deterministically, record the current DOM text, console warnings/errors, and server logs around the failing turn before changing more code.

## Task 5: Repository Validation

**Files:**
- No planned edits unless validation fails.

- [ ] **Step 1: Run quick validation**

Run:

```bash
bun run validate:quick
```

Expected: exit `0`.

- [ ] **Step 2: Escalate if quick validation reports affected-package risk**

If the validator reports that UI changes require broader checks, run:

```bash
bun run validate:affected
```

Expected: exit `0`.

- [ ] **Step 3: Report residual risk**

If validation fails in files outside the current focused fix, report exact file paths and failing commands. Do not hide or bundle unrelated failures into the subtask/status fix.

## Self-Review Checklist

- [ ] The subtask race is fixed at the child-session refresh source, not by hiding the fallback text.
- [ ] Status announcement action suppression is narrow enough that real assistant answers still get actions.
- [ ] No hardcoded color/style changes are introduced.
- [ ] No git/GitHub commands are used unless the user explicitly asks.
- [ ] `bun run validate:quick` result is reported with actual evidence.
