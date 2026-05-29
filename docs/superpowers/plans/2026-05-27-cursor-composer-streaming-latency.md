# Cursor Composer Streaming Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cursor Composer/Composer 2 turns stream incremental assistant output in DevRyan instead of waiting for `run.wait()` and rendering a full block at the end, while preserving plan-mode titles and sidebar lifecycle indicators.

**Architecture:** The Cursor bridge should treat Cursor SDK `onDelta` interaction updates as the hot-path source of assistant text/thinking/tool progress, and keep `run.stream()` plus `run.wait()` as compatibility/final-reconciliation sources. The shared UI plan/sidebar logic is already event-driven, so the backend must emit the same ordered `message.updated`, `message.part.updated`, and `session.status` events that other providers receive.

**Tech Stack:** Bun/Vitest tests, shared `@openchamber/cursor-sdk-runtime`, Cursor SDK `Agent.send(..., { onDelta })`, web server OpenCode route intercept, shared UI sync reducer/sidebar tests, Agent Browser manual validation.

---

## Root Cause Analysis

`packages/cursor-sdk-runtime/index.js` currently sends Cursor prompts through `agent.send(message, { model })`, then reads `run.stream()` and races the stream iterator against `run.wait()`. If Cursor emits low-latency interaction deltas through the `onDelta` callback but delays or omits legacy stream frames, DevRyan ignores the deltas and the first visible assistant text can come from `run.wait()` as one completed block.

The installed `@cursor/sdk` type surface confirms `SendOptions` supports:

```typescript
onDelta?: (args: { update: InteractionUpdate }) => void | Promise<void>;
```

The bundled SDK maps interaction updates such as `text-delta`, `thinking-delta`, and tool-call updates into SDK-style messages internally, but DevRyan only consumes `run.stream()`. This explains the provider-specific latency: non-Cursor providers stream through OpenCode SSE directly; Cursor sessions are intercepted and translated by DevRyan.

Plan/sidebar indicators depend on the resulting event sequence, not on provider identity:

1. User plan-mode message is stored with `metadata.openchamberPlanMode` and a synthetic plan instruction part.
2. Assistant plan text must arrive as a text part containing `<!--plan-->` or structured plan headings.
3. Assistant completion and `session.status idle` trigger `detectAndMarkPlanLifecycle`.
4. `resolveSidebarIndicator` shows yellow for `proposed` plans and green for unread completed work.

Fixing Cursor event fidelity should make these indicators behave like other providers. Add tests so regressions are caught without relying only on manual Composer runs.

## Files

- Modify: `packages/cursor-sdk-runtime/index.js`
  - Add a small Cursor interaction-update normalizer.
  - Pass `onDelta` to direct Cursor SDK sends and merge those events into the existing run stream.
- Modify: `packages/cursor-sdk-runtime/node-worker.mjs`
  - Pass `onDelta` inside the Bun worker path and forward normalized messages over stdout.
  - Let final `wait()` text reconcile with streamed deltas rather than replacing the stream path.
- Test: `packages/web/server/lib/opencode/cursor-sdk-runtime.test.js`
  - Add a regression test where `onDelta` emits a chunk before legacy stream/wait output.
  - Add a plan-mode regression proving a Cursor plan delta becomes a normalized plan card and reaches final idle state.
  - Replace the pinned Composer 2 Orchestrator plan-mode block with coverage that proves the run reaches the SDK with a runtime model-pinning contract.
  - Cover the direct non-delegating instructions used for pinned Composer 2 Orchestrator plan mode so the model does not switch to a subagent model.
- Test: `packages/ui/src/sync/sync-context.plan-lifecycle.test.ts`
  - Extend existing coverage only if backend event tests reveal a UI-side lifecycle gap.
- Test/Manual: Agent Browser against the local app
  - Send a new plan-mode prompt to Cursor Composer 2.
  - Confirm the assistant text appears incrementally, title is summarized, yellow proposed-plan dot appears after plan proposal, and green completion dot appears after implementing/completing while unread.

---

### Task 1: Add Failing Cursor Delta Regression

**Files:**
- Modify: `packages/web/server/lib/opencode/cursor-sdk-runtime.test.js`

- [ ] **Step 1: Add a test where Cursor `onDelta` beats legacy stream/wait**

Append a test in the `Cursor SDK runtime` suite:

```javascript
  it('streams Cursor SDK onDelta text before the final wait result', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const emitted = [];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      loadSdk: async () => ({
        Agent: {
          create: async () => ({
            agentId: 'agent-test',
            send: async (_message, options = {}) => {
              setTimeout(() => {
                options.onDelta?.({ update: { type: 'text-delta', text: 'First streamed chunk. ' } });
              }, 5);
              return {
                stream: async function* stream() {
                  await new Promise(() => {});
                },
                wait: async () => {
                  await new Promise((resolve) => setTimeout(resolve, 20));
                  return {
                    status: 'finished',
                    result: 'First streamed chunk. Final answer.',
                  };
                },
              };
            },
          }),
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_delta_stream',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2' },
        messageID: 'msg_delta_stream_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_delta_stream');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const assistantTextEvents = emitted.filter((event) => (
      event?.type === 'message.part.updated'
      && event.properties?.part?.messageID === 'msg_delta_stream_user_assistant'
      && event.properties?.part?.type === 'text'
    ));
    expect(assistantTextEvents[0]?.properties?.part?.text).toBe('First streamed chunk. ');
    expect(assistantTextEvents.at(-1)?.properties?.part?.text).toBe('First streamed chunk. Final answer.');
  });
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
bun test packages/web/server/lib/opencode/cursor-sdk-runtime.test.js --test-name-pattern "streams Cursor SDK onDelta text before the final wait result"
```

Expected: fail because `agent.send` is not called with `onDelta`, so the first assistant text event is the final wait result.

### Task 2: Wire Cursor Interaction Deltas Into Direct Runtime

**Files:**
- Modify: `packages/cursor-sdk-runtime/index.js`

- [ ] **Step 1: Add `normalizeInteractionUpdateToSdkMessage(update)`**

Implement a local normalizer for the Cursor update shapes used by the SDK:

```javascript
const normalizeInteractionUpdateToSdkMessage = (input) => {
  const update = isPlainObject(input?.update) ? input.update : input;
  if (!isPlainObject(update)) return null;
  if (update.type === 'text-delta') {
    const text = trimString(update.text ?? update.delta);
    return text ? { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } } : null;
  }
  if (update.type === 'thinking-delta') {
    const text = trimString(update.text ?? update.delta);
    return text ? { type: 'thinking', text } : null;
  }
  if (update.type === 'tool-call-started' || update.type === 'partial-tool-call' || update.type === 'tool-call-completed') {
    const toolCall = isPlainObject(update.toolCall) ? update.toolCall : {};
    return {
      type: 'tool_call',
      call_id: trimString(update.callId ?? update.call_id ?? toolCall.callId ?? toolCall.id),
      name: trimString(toolCall.name ?? toolCall.type ?? update.name) || 'tool',
      status: update.type === 'tool-call-completed' ? 'completed' : normalizeToolCallStatus(update.status),
      ...(hasOwn(toolCall, 'args') ? { args: toolCall.args } : {}),
      ...(hasOwn(toolCall, 'result') ? { result: toolCall.result } : {}),
    };
  }
  return null;
};
```

- [ ] **Step 2: Add a tiny async queue for callback events**

Use a local queue with `push`, `next`, and `close` so `onDelta` callback messages can be merged with `run.stream()` events without mutating assistant records from two concurrent paths.

- [ ] **Step 3: Pass `onDelta` into `agent.send`**

Change direct send to:

```javascript
const deltaQueue = createAsyncQueue();
const run = await agent.send(message, {
  model,
  onDelta: (event) => {
    const sdkMessage = normalizeInteractionUpdateToSdkMessage(event);
    if (sdkMessage) deltaQueue.push({ type: 'message', message: sdkMessage });
  },
});
```

- [ ] **Step 4: Race the queue alongside `run.stream()` and `wait()`**

Keep `wait()` as final reconciliation, but include queued delta events in the existing stream generator race so the outer pump receives low-latency text before the final result.

- [ ] **Step 5: Re-run the focused test**

Run the command from Task 1. Expected: pass.

### Task 3: Wire Cursor Interaction Deltas Through The Node Worker

**Files:**
- Modify: `packages/cursor-sdk-runtime/node-worker.mjs`

- [ ] **Step 1: Add the same normalizer in the worker**

Mirror the small normalizer because the worker is a separate process and should not import the full runtime entrypoint.

- [ ] **Step 2: Pass `onDelta` into `agent.send`**

Forward normalized delta messages with:

```javascript
writeEvent({ type: 'message', message: sdkMessage });
```

- [ ] **Step 3: Always forward non-empty final wait text**

Let the outer runtime’s text merge logic reconcile final text with streamed deltas. This preserves missing tail text without reintroducing duplicate output for identical/snapshot frames.

### Task 4: Add Plan-Mode Regression Coverage

**Files:**
- Modify: `packages/web/server/lib/opencode/cursor-sdk-runtime.test.js`

- [ ] **Step 1: Add a Cursor Composer 2 plan-mode delta test**

Use `onDelta` to emit structured plan text in chunks:

```javascript
options.onDelta?.({ update: { type: 'text-delta', text: '# Cursor Streaming Plan\n\n## Context\n\nComposer streams deltas.\n\n## Implementation\n\n1. Wire onDelta.\n' } });
```

Assert the final stored assistant text contains:

```text
<!--plan-->
# Cursor Streaming Plan
```

and `runtime.getSessionStatus().ses_cursor_plan_delta` is `{ type: 'idle' }`.

- [ ] **Step 2: Run the focused plan test**

```bash
bun test packages/web/server/lib/opencode/cursor-sdk-runtime.test.js --test-name-pattern "plan-mode delta"
```

Expected: pass after Task 2.

### Task 5: Validation And Manual Composer 2 Test

**Files:**
- No code changes unless tests expose a UI-side lifecycle bug.

- [ ] **Step 1: Run affected automated checks**

```bash
bun run --cwd packages/web test -- packages/web/server/lib/opencode/cursor-sdk-runtime.test.js
bun test packages/ui/src/sync/sync-context.plan-lifecycle.test.ts packages/ui/src/components/session/sidebar/sessionIndicator.test.ts packages/ui/src/sync/cursor-title-repair.test.ts packages/ui/src/lib/sessionTitles.test.ts
bun run validate:affected
```

- [ ] **Step 2: Start the app**

```bash
bun run dev:web:full
```

- [ ] **Step 3: Agent Browser manual test**

Use Agent Browser to open the local app, select Cursor → Composer 2, enable the new plan mode, create a fresh session, and send:

```text
Plan a small read-only audit of this repository's Cursor streaming bridge. Do not modify files.
```

Expected:
- Assistant output appears incrementally before final completion.
- Session title is a concise summary such as `Plan Cursor Streaming Bridge Audit`, not the exact prompt.
- Sidebar dot turns yellow after a plan proposal.
- After clicking the plan implementation action and letting the task finish in a background/unviewed session, sidebar dot turns green.

---

## Self-Review

- Spec coverage: latency, Cursor-only provider path, Composer 2 plan mode, summarized title, proposed/completed indicators, and continuous validation are covered.
- Placeholder scan: no placeholder task remains; each task names files and concrete assertions.
- Type consistency: the plan uses Cursor SDK `onDelta` update names exported by the installed SDK and maps them to existing SDK message shapes already consumed by `runPrompt`.
