# App Freeze Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify and fix intermittent DevRyan UI freezes where spinner animations still run, proving the root cause before changing behavior.

**Architecture:** Treat the symptom as an app-level responsiveness failure, not a total renderer crash. Add low-overhead diagnostics around the main-thread event loop, sync pipeline, store fanout, and stream transport, then use the evidence to choose one narrow fix. Existing stream debug counters and the memory/debug panel are the integration points.

**Tech Stack:** React, TypeScript, Zustand, Vite, Bun, Express/WebSocket/SSE, Electron renderer, VS Code webview.

---

## File Structure

- Modify `packages/ui/src/stores/utils/streamDebug.ts`: add gated responsiveness counters, long-task/event-loop-lag samples, and a snapshot API beside existing stream perf utilities.
- Modify `packages/ui/src/components/ui/MemoryDebugPanel.tsx`: expose the responsiveness snapshot next to existing streaming metrics and include it in the copy payload.
- Modify `packages/ui/src/sync/event-pipeline.ts`: measure enqueue latency, flush batch duration, queue depth, transport reconnects, and heartbeat aborts through the existing debug utility.
- Modify `packages/ui/src/sync/sync-context.tsx`: measure reducer/application time per event type and count no-op vs state-changing events.
- Modify `packages/ui/src/components/chat/MessageList.tsx`, `packages/ui/src/components/chat/ChatMessage.tsx`, and `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx`: reuse existing counters and add any missing render-duration measurements needed to correlate freezes with streaming renders.
- Add `packages/ui/src/stores/utils/streamDebug.test.ts`: unit-test the diagnostics gating and snapshot/reset behavior.
- Add or extend `packages/ui/src/sync/__tests__/event-pipeline.test.js`: verify instrumentation does not change coalescing, delivery order, or reconnect behavior.
- Use existing `packages/ui/src/sync/__tests__/event-pipeline.bench.js`: compare pre/post event throughput and flush latency under realistic streaming load.
- Update `packages/ui/src/sync/DOCUMENTATION.md` if the investigation changes sync contracts, event batching behavior, store shape, or hot-path rules.
- Update `CODEMAP.md` only if new diagnostics files or ownership points are added.

## Task 1: Reproduce and Capture a Baseline

- [ ] Enable the existing stream perf flag in the browser/Electron renderer console:

```js
localStorage.setItem("openchamber_stream_debug", "1")
```

- [ ] Enable sync debug logging only during the reproduction window:

```js
localStorage.setItem("openchamber:sync:debug", "1")
```

- [ ] Reproduce the freeze in the runtime where the user observes it first: Electron if it is the desktop app, web if it is browser, VS Code if it is extension webview.
- [ ] When frozen, record whether text input, session switching, scrolling, command palette, and network activity are responsive. Spinner animation alone only proves CSS animation is still compositing; it does not prove React/event handlers are healthy.
- [ ] Open the debug panel and copy the streaming payload. Preserve the copied JSON as investigation evidence in the issue or implementation notes, not as a committed fixture unless it is sanitized and intentionally added as a test fixture.
- [ ] Capture a Chrome/Electron Performance profile for 10-20 seconds around the freeze and classify the top offender as one of:
  - long JavaScript task on the renderer main thread
  - excessive React commit/render loop
  - sync event backlog
  - transport disconnected while UI remains in a busy state
  - pending promise/request that never resolves

## Task 2: Add Gated Responsiveness Diagnostics

- [ ] Write failing tests in `packages/ui/src/stores/utils/streamDebug.test.ts` for:
  - diagnostics are disabled when `openchamber_stream_debug` is absent
  - `setStreamPerfEnabled(true)` initializes both stream and responsiveness state
  - `resetStreamPerf()` clears responsiveness counters
  - snapshot entries sort by total time, matching existing stream perf behavior

- [ ] Add a small API to `packages/ui/src/stores/utils/streamDebug.ts`:

```ts
export const responsivenessPerfObserve = (metric: string, value: number): void => {
  updatePerfCounter(`responsiveness.${metric}`, value);
};

export const responsivenessPerfCount = (metric: string, count = 1): void => {
  updatePerfCounter(`responsiveness.${metric}`, count);
};

export const getResponsivenessPerfSnapshot = (): StreamPerfSnapshot => getStreamPerfSnapshot();
```

- [ ] Keep all instrumentation behind `streamPerfEnabled()` so normal hot paths still early-return with negligible cost.
- [ ] Run:

```bash
bun test packages/ui/src/stores/utils/streamDebug.test.ts
```

Expected: the new tests pass, and existing stream debug tests remain unaffected.

## Task 3: Instrument Event Pipeline Backlog

- [ ] Add measurements in `packages/ui/src/sync/event-pipeline.ts` for:
  - `event_pipeline.enqueue_count`
  - `event_pipeline.queue_depth`
  - `event_pipeline.flush_count`
  - `event_pipeline.flush_size`
  - `event_pipeline.flush_ms`
  - `event_pipeline.transport_switch`
  - `event_pipeline.disconnect`
  - `event_pipeline.heartbeat_abort`

- [ ] Measure `flushDir()` with `performance.now()` around the loop that calls `onEvent(directory, payload)`.
- [ ] Count queue depth after coalescing, not before, so the number reflects the work React/store updates will actually receive.
- [ ] Extend `packages/ui/src/sync/__tests__/event-pipeline.test.js` to assert instrumentation does not alter:
  - per-directory queue isolation
  - `message.part.delta` coalescing
  - `session.status` replacement
  - WS-to-SSE fallback behavior

- [ ] Run:

```bash
bun test packages/ui/src/sync/__tests__/event-pipeline.test.js
```

Expected: all existing behavior tests pass.

## Task 4: Instrument Store Application and Render Cost

- [ ] In `packages/ui/src/sync/sync-context.tsx`, measure per-event reducer/application time around the call path that applies `handleDirectoryEvent`.
- [ ] Record metrics with event type in the name, for example:

```ts
responsivenessPerfObserve(`sync.apply.${payload.type}.ms`, elapsedMs);
responsivenessPerfCount(reducerChanged ? "sync.event.changed" : "sync.event.noop");
```

- [ ] In `packages/ui/src/components/chat/MessageList.tsx`, `ChatMessage.tsx`, and `AssistantTextPart.tsx`, fill any gap where render counts exist but duration is missing, using `streamPerfMeasure`.
- [ ] Do not add broad store subscriptions for diagnostics. The debug panel may read aggregate snapshots; production components must not subscribe to new global diagnostic objects.
- [ ] Run:

```bash
bun test packages/ui/src/sync/__tests__/event-reducer.test.js packages/ui/src/sync/streaming.test.ts
```

Expected: reducer no-op behavior and streaming state derivation still pass.

## Task 5: Expose a Freeze Evidence Bundle

- [ ] Modify `packages/ui/src/components/ui/MemoryDebugPanel.tsx` to show a compact “Responsiveness” section under the existing streaming tab.
- [ ] Include queue depth, max flush time, max sync apply time, render duration totals, disconnect count, and heartbeat abort count when available.
- [ ] Extend the existing copy payload:

```ts
const payload = {
  generatedAt: new Date().toISOString(),
  ui: getStreamPerfSnapshot(),
  vscode: getVsCodeStreamPerfSnapshot(),
  responsiveness: getResponsivenessPerfSnapshot(),
};
```

- [ ] Avoid visible explanatory text outside the debug panel. This is diagnostic UI, not a product-facing workflow.
- [ ] Run:

```bash
bun run validate:quick
```

Expected: lint/type checks for affected files pass.

## Task 6: Use Evidence to Choose the Fix

- [ ] If the evidence shows event queue backlog or long `flush_ms`, reduce delivered work:
  - coalesce more same-entity events in `packages/ui/src/sync/event-pipeline.ts`
  - lower per-flush work or yield between directories
  - add tests in `event-pipeline.test.js` for the new coalescing rule

- [ ] If the evidence shows slow `sync.apply.*.ms`, fix the reducer/store path:
  - preserve references for untouched state fields in `packages/ui/src/sync/sync-context.tsx`
  - avoid scans on high-frequency event types before a cheap guard
  - add reducer tests proving no-op events return unchanged references

- [ ] If the evidence shows render fanout, fix selectors/component boundaries:
  - replace broad selectors with leaf selectors in the identified component
  - wrap hot consumers in `React.memo`
  - update custom comparators only for render-relevant fields
  - add focused render-regression tests where local precedent exists

- [ ] If the evidence shows transport disconnect with stale busy UI, fix live-state recovery:
  - inspect `packages/ui/src/sync/event-pipeline.ts`, `reconnect-recovery.ts`, and `session.status` bootstrap
  - ensure disconnect/reconnect clears stale transient busy state only when authoritative status or bounded recovery says it should
  - add reconnect recovery tests

- [ ] If the evidence shows a never-resolving runtime request, fix the owning runtime API:
  - web/Electron backend: start from `packages/web/server/index.js` then move logic into the focused `packages/web/server/lib/*` owner
  - VS Code: start from `packages/vscode/src/bridge.ts` and the relevant `bridge-*-runtime.ts`
  - add timeout, cancellation, or partial-failure-safe handling at the core logic layer, not only in UI

## Task 7: Validate the Fix

- [ ] Run the narrow tests for the changed path.
- [ ] Run the event pipeline benchmark before and after:

```bash
bun packages/ui/src/sync/__tests__/event-pipeline.bench.js
```

Expected: no regression in output ordering or delivered event count; flush/enqueue time should improve or stay neutral.

- [ ] Run affected validation:

```bash
bun run validate:affected
```

Expected: affected lint, type-check, and tests pass.

- [ ] For cross-runtime stream or bridge changes, also run:

```bash
bun run type-check
bun run lint
```

Expected: workspace type-check and lint pass.

- [ ] Manually verify the runtime where the freeze occurred with `openchamber_stream_debug=1`, then disable debug flags:

```js
localStorage.removeItem("openchamber_stream_debug")
localStorage.removeItem("openchamber:sync:debug")
```

## Self-Review

- Spec coverage: the plan covers reproduction, diagnostics, sync/event/store/render/transport investigation, targeted fix selection, and validation.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test commands remain.
- Type consistency: diagnostics reuse the existing `StreamPerfSnapshot` and `streamDebug.ts` API shape.
