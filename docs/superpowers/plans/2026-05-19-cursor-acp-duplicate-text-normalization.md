# Cursor ACP Duplicate Text Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicated Cursor ACP assistant/status text from appearing in DevRyan chat, including fresh streaming output and already-persisted OpenCode message records.

**Architecture:** Normalize exact adjacent duplicate long text frames at DevRyan's UI/sync ingestion boundaries, not only in rendering. The fix must handle three paths: coalesced live `message.part.delta` events, direct reducer deltas, and fetched `/session/:id/message` records that already contain duplicated text inside a single text part. Keep the heuristic narrow: exact adjacent repeats only, minimum length guarded, no reasoning-part collapse.

**Tech Stack:** Bun, TypeScript, React, OpenCode SDK v2, DevRyan sync reducers.

---

## Evidence

- Live reproduction on `http://127.0.0.1:3001/?session=ses_1c1e3de61ffeHHnmq6v5imiXNy` showed new Composer 2.5 output with duplicated assistant text in the same paragraph:
  - `Continuing implementation: creating the hook and history section, then wiring them into the shell.`
  - repeated immediately, followed by surfaced `Skipped malformed tool call "edit"...`.
- Authoritative API evidence from `GET /api/session/ses_1c1e3de61ffeHHnmq6v5imiXNy/message?limit=6` showed the duplicate is already persisted in OpenCode records:

```text
Continuing implementation: creating the hook and history section, then wiring them into the shell.
Continuing implementation: creating the hook and history section, then wiring them into the shell.
Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string...
```

- Current DevRyan fixes only cover:
  - duplicate full delta after an existing part already contains that delta: `packages/ui/src/sync/part-delta.ts`
  - duplicate adjacent text parts at render time: `packages/ui/src/components/chat/message/partUtils.ts`
- The failing case is different: duplicate content is inside one delta string or one persisted text part.
- `packages/ui/src/sync/event-pipeline.ts` coalesces same-part delta events by raw string concatenation before `event-reducer.ts` sees them. If Cursor emits duplicate full frames within one 33ms flush, reducer-level existing-vs-delta dedupe is bypassed.

## External Reference: Nomadcxx/opencode-cursor

- The repo describes a Cursor/OpenCode HTTP proxy that spawns `cursor-agent --output-format stream-json`, converts assistant/thinking events to SSE chunks, and has an explicit provider boundary/tool-loop guard.
- Its `src/streaming/openai-sse.ts` uses `sawAssistantPartials` and `sawThinkingPartials`: events with `timestamp_ms` are treated as partial deltas; once partials were seen, the later accumulated assistant/thinking event is skipped to prevent 2x duplication.
- Its `src/streaming/delta-tracker.ts` keeps `lastText`/`lastThinking`, emits only the suffix when accumulated text grows, returns empty when a duplicate/trimmed event is already represented, and falls back to longest-common-prefix diff on mismatch.
- Takeaway for DevRyan: the cleanest fix belongs at the Cursor provider boundary, but DevRyan must defensively normalize because it receives already-duplicated persisted OpenCode records and does not own the upstream Cursor ACP stream converter.

## File Structure

- Modify: `packages/ui/src/sync/part-delta.ts`
  - Owns text delta append behavior.
  - Add a narrow exact-adjacent-repeat normalizer and use it in streaming text/output append helpers.
- Create: `packages/ui/src/sync/part-delta.test.ts`
  - Unit tests for exact adjacent duplicate collapse and intentional repeat preservation.
- Modify: `packages/ui/src/sync/event-pipeline.ts`
  - Stop raw-concatenating coalesced text/output deltas; use the same append helper for coalesced `text` and `output` fields.
- Create or modify: `packages/ui/src/sync/event-pipeline.test.ts`
  - If no current test harness exists for `createEventPipeline`, extract a pure helper from `event-pipeline.ts` and test that helper.
- Modify: `packages/ui/src/sync/event-reducer.ts`
  - Continue using the normalized append helper; add a test for one already-coalesced duplicate delta.
- Modify: `packages/ui/src/sync/__tests__/event-reducer.test.js`
  - Add regression coverage for `delta = A + "\n" + A + "\nSkipped malformed..."`.
- Modify: `packages/ui/src/sync/message-fetch.ts`
  - Add persisted-message part normalization before records enter materialization.
- Create: `packages/ui/src/sync/message-fetch.test.ts`
  - Verify fetched/persisted single text parts are normalized without changing message metadata.
- Modify: `packages/ui/src/sync/pending-part-deltas.ts`
  - Replace raw pending-delta concatenation with normalized text/output append behavior.
- Modify: `packages/ui/src/components/chat/message/partUtils.ts`
  - Optional final display fallback only if ingestion normalization cannot cover all render paths. Keep adjacent-part collapse as-is.

---

### Task 1: Add Exact Adjacent Repeat Normalizer

**Files:**
- Modify: `packages/ui/src/sync/part-delta.ts`
- Create: `packages/ui/src/sync/part-delta.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/sync/part-delta.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import {
  appendStreamingTextDelta,
  collapseExactAdjacentTextRepeats,
} from "./part-delta"

describe("collapseExactAdjacentTextRepeats", () => {
  test("collapses a duplicated complete status line inside one value", () => {
    const line = "Continuing implementation: creating the hook and history section, then wiring them into the shell."
    expect(collapseExactAdjacentTextRepeats(`${line}\n${line}\nSkipped malformed tool call "edit": Invalid arguments for tool "edit".`))
      .toBe(`${line}\nSkipped malformed tool call "edit": Invalid arguments for tool "edit".`)
  })

  test("collapses a jammed duplicated tool diagnostic inside one value", () => {
    const diagnostic = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string. missing required: old_string | edit requires path, old_string, and new_string'
    expect(collapseExactAdjacentTextRepeats(`${diagnostic}${diagnostic}Tool loop guard stopped repeated schema-invalid calls to "edit" after 4 attempts (limit 2).`))
      .toBe(`${diagnostic}Tool loop guard stopped repeated schema-invalid calls to "edit" after 4 attempts (limit 2).`)
  })

  test("keeps short intentional repetition", () => {
    expect(collapseExactAdjacentTextRepeats("ha\nha")).toBe("ha\nha")
  })

  test("keeps non-adjacent repeated long text", () => {
    const line = "This is a long sentence that may legitimately return later in a response."
    expect(collapseExactAdjacentTextRepeats(`${line}\nDifferent middle sentence.\n${line}`))
      .toBe(`${line}\nDifferent middle sentence.\n${line}`)
  })
})

describe("appendStreamingTextDelta", () => {
  test("normalizes a duplicated first frame in a single coalesced delta", () => {
    const frame = "Continuing implementation: creating the hook and history section, then wiring them into the shell."
    expect(appendStreamingTextDelta("", `${frame}\n${frame}\n`)).toBe(`${frame}\n`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/ui/src/sync/part-delta.test.ts
```

Expected: FAIL because `collapseExactAdjacentTextRepeats` is not exported and `appendStreamingTextDelta` still returns the duplicated coalesced value.

- [ ] **Step 3: Implement the normalizer**

In `packages/ui/src/sync/part-delta.ts`, add the exported helper and use it from `appendStreamingTextDelta`:

```ts
const MIN_FULL_FRAME_DUPLICATE_LENGTH = 32
const MAX_DUPLICATE_SCAN_LENGTH = 2048

function isMeaningfulDuplicateCandidate(value: string): boolean {
  return value.trim().length >= MIN_FULL_FRAME_DUPLICATE_LENGTH
}

function collapseLineRepeats(value: string): string {
  const lines = value.split(/(\r?\n)/)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index] ?? ""
    const separator = lines[index + 1] ?? ""
    const next = lines[index + 2] ?? ""
    if (
      separator.match(/^\r?\n$/)
      && isMeaningfulDuplicateCandidate(current)
      && current.trim() === next.trim()
    ) {
      output.push(current, separator)
      index += 2
      continue
    }
    output.push(current)
  }

  return output.join("")
}

function collapseJammedRepeats(value: string): string {
  if (value.length > MAX_DUPLICATE_SCAN_LENGTH) {
    return value
  }

  let output = value
  let changed = true
  while (changed) {
    changed = false
    for (let start = 0; start < output.length; start += 1) {
      const maxLength = Math.floor((output.length - start) / 2)
      for (let length = maxLength; length >= MIN_FULL_FRAME_DUPLICATE_LENGTH; length -= 1) {
        const first = output.slice(start, start + length)
        if (!isMeaningfulDuplicateCandidate(first)) continue
        const secondStart = start + length
        const second = output.slice(secondStart, secondStart + length)
        if (first !== second) continue
        output = output.slice(0, secondStart) + output.slice(secondStart + length)
        changed = true
        break
      }
      if (changed) break
    }
  }
  return output
}

export function collapseExactAdjacentTextRepeats(value: string): string {
  if (value.length < MIN_FULL_FRAME_DUPLICATE_LENGTH * 2) {
    return value
  }
  return collapseJammedRepeats(collapseLineRepeats(value))
}

export function appendStreamingTextDelta(existingValue: string | undefined, delta: string) {
  const existing = existingValue ?? ""
  if (delta.length === 0) return existing
  if (existing.length === 0) return collapseExactAdjacentTextRepeats(delta)

  if (delta.length >= MIN_FULL_FRAME_DUPLICATE_LENGTH && existing.endsWith(delta)) {
    return existing
  }

  return collapseExactAdjacentTextRepeats(existing + delta)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/ui/src/sync/part-delta.test.ts
```

Expected: PASS.

---

### Task 2: Normalize Coalesced Live Deltas Before Reducer

**Files:**
- Modify: `packages/ui/src/sync/event-pipeline.ts`
- Create or modify: `packages/ui/src/sync/event-pipeline.test.ts`

- [ ] **Step 1: Extract a pure coalescing helper and write failing tests**

Add a test file `packages/ui/src/sync/event-pipeline.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { coalescePartDeltaValue } from "./event-pipeline"

describe("coalescePartDeltaValue", () => {
  test("normalizes duplicate coalesced text frames", () => {
    const frame = "Continuing implementation: creating the hook and history section, then wiring them into the shell."
    expect(coalescePartDeltaValue("text", frame, `\n${frame}\n`)).toBe(`${frame}\n`)
  })

  test("normalizes duplicate coalesced output frames", () => {
    const frame = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string.'
    expect(coalescePartDeltaValue("output", frame, frame)).toBe(frame)
  })

  test("raw-appends non-text fields", () => {
    expect(coalescePartDeltaValue("other", "a", "a")).toBe("aa")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/ui/src/sync/event-pipeline.test.ts
```

Expected: FAIL because `coalescePartDeltaValue` does not exist.

- [ ] **Step 3: Implement helper and replace raw concatenation**

In `packages/ui/src/sync/event-pipeline.ts`:

```ts
import { appendStreamingTextDelta } from "./part-delta"

export function coalescePartDeltaValue(field: string, previousDelta: string, incomingDelta: string): string {
  if (field === "text" || field === "output") {
    return appendStreamingTextDelta(previousDelta, incomingDelta)
  }
  return previousDelta + incomingDelta
}
```

Then replace:

```ts
delta: prev.properties.delta + inc.delta,
```

with:

```ts
delta: coalescePartDeltaValue(
  typeof inc.field === "string" ? inc.field : "",
  prev.properties.delta,
  inc.delta,
),
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test packages/ui/src/sync/event-pipeline.test.ts packages/ui/src/sync/part-delta.test.ts
```

Expected: PASS.

---

### Task 3: Add Reducer Regression for Single Coalesced Duplicate Delta

**Files:**
- Modify: `packages/ui/src/sync/__tests__/event-reducer.test.js`

- [ ] **Step 1: Add failing regression test**

Append this test near the existing duplicate delta tests:

```js
  it("normalizes duplicate full text frames inside one coalesced delta", () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = "msg-coalesced-duplicate"
    const partID = "part-coalesced-duplicate"
    const duplicated = "Continuing implementation: creating the hook and history section, then wiring them into the shell."

    applyDirectoryEvent(state, {
      type: "message.part.updated",
      properties: {
        part: {
          id: partID,
          type: "text",
          messageID,
          text: "",
        },
      },
    })

    applyDirectoryEvent(state, {
      type: "message.part.delta",
      properties: {
        messageID,
        partID,
        field: "text",
        delta: `${duplicated}\n${duplicated}\nSkipped malformed tool call "edit": Invalid arguments for tool "edit".`,
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe(
      `${duplicated}\nSkipped malformed tool call "edit": Invalid arguments for tool "edit".`,
    )
  })
```

- [ ] **Step 2: Run test**

Run:

```bash
bun test packages/ui/src/sync/__tests__/event-reducer.test.js
```

Expected: PASS after Task 1. If it fails, ensure `event-reducer.ts` still calls `appendStreamingTextDelta` for `text` and `output`.

---

### Task 4: Normalize Fetched Persisted Message Parts

**Files:**
- Modify: `packages/ui/src/sync/message-fetch.ts`
- Create: `packages/ui/src/sync/message-fetch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/sync/message-fetch.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { normalizeFetchedMessageRecords } from "./message-fetch"

const message = (id: string): Message => ({
  id,
  sessionID: "ses_1",
  role: "assistant",
  time: { created: 1 },
} as Message)

const textPart = (messageID: string, text: string): Part => ({
  id: `${messageID}_part`,
  messageID,
  type: "text",
  text,
} as Part)

describe("normalizeFetchedMessageRecords", () => {
  test("normalizes duplicate text inside persisted fetched records", () => {
    const line = "Picking up implementation: creating the hook and history section, then wiring them into the shell."
    const records = normalizeFetchedMessageRecords([
      { info: message("msg_1"), parts: [textPart("msg_1", `${line}\n${line}\n`)] },
    ])

    expect((records[0]?.parts?.[0] as { text?: string }).text).toBe(`${line}\n`)
  })

  test("preserves non-text parts and message info identity where parts do not change", () => {
    const info = message("msg_2")
    const tool = { id: "tool_1", messageID: "msg_2", type: "tool", output: "ok" } as Part
    const records = normalizeFetchedMessageRecords([{ info, parts: [tool] }])

    expect(records[0]?.info).toBe(info)
    expect(records[0]?.parts?.[0]).toBe(tool)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/ui/src/sync/message-fetch.test.ts
```

Expected: FAIL because `normalizeFetchedMessageRecords` does not exist.

- [ ] **Step 3: Implement fetch normalization**

In `packages/ui/src/sync/message-fetch.ts`:

```ts
import { collapseExactAdjacentTextRepeats } from "./part-delta"

function normalizeFetchedPart(part: Part): Part {
  if (part.type !== "text") {
    return part
  }

  const text = (part as { text?: unknown }).text
  if (typeof text !== "string") {
    return part
  }

  const normalized = collapseExactAdjacentTextRepeats(text)
  if (normalized === text) {
    return part
  }

  return { ...part, text: normalized } as Part
}

export function normalizeFetchedMessageRecords(records: MessageRecord[]): MessageRecord[] {
  return records.map((record) => {
    const parts = record.parts
    if (!Array.isArray(parts) || parts.length === 0) {
      return record
    }

    let changed = false
    const normalizedParts = parts.map((part) => {
      const normalized = normalizeFetchedPart(part)
      changed ||= normalized !== part
      return normalized
    })

    return changed ? { ...record, parts: normalizedParts } : record
  })
}

export function unwrapMessageRecordsResult(
  result: { data?: MessageRecord[]; error?: unknown; response?: { status?: number } },
): MessageRecord[] {
  return normalizeFetchedMessageRecords(unwrapSdkResult(result, "session.messages"))
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test packages/ui/src/sync/message-fetch.test.ts packages/ui/src/sync/part-delta.test.ts
```

Expected: PASS.

---

### Task 5: Normalize Pending Part Delta Accumulation

**Files:**
- Modify: `packages/ui/src/sync/pending-part-deltas.ts`
- Create or modify: `packages/ui/src/sync/pending-part-deltas.test.ts`

- [ ] **Step 1: Add failing pending-delta test**

If `pending-part-deltas.test.ts` exists, add this test there. Otherwise create it:

```ts
import { describe, expect, test } from "bun:test"
import { addPendingPartDelta, type PendingPartDeltaStore } from "./pending-part-deltas"

describe("addPendingPartDelta", () => {
  test("normalizes duplicate pending text deltas before materialization", () => {
    const store: PendingPartDeltaStore = new Map()
    const frame = "Continuing implementation: creating the hook and history section, then wiring them into the shell."

    addPendingPartDelta(store, "/repo", {
      messageID: "msg_1",
      partID: "part_1",
      field: "text",
      delta: frame,
    }, 1)
    addPendingPartDelta(store, "/repo", {
      messageID: "msg_1",
      partID: "part_1",
      field: "text",
      delta: `\n${frame}\n`,
    }, 2)

    expect(Array.from(store.values())[0]?.delta).toBe(`${frame}\n`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/ui/src/sync/pending-part-deltas.test.ts
```

Expected: FAIL because pending accumulation raw-concatenates deltas.

- [ ] **Step 3: Use normalized append for text/output pending deltas**

In `packages/ui/src/sync/pending-part-deltas.ts`, import `appendStreamingTextDelta` and replace raw pending concatenation:

```ts
import { appendNonOverlappingDelta, appendStreamingTextDelta } from "./part-delta"

function appendPendingDelta(field: string, existing: string | undefined, incoming: string): string {
  if (field === "text" || field === "output") {
    return appendStreamingTextDelta(existing, incoming)
  }
  return existing ? existing + incoming : incoming
}
```

Then update `addPendingPartDelta`:

```ts
delta: appendPendingDelta(pending.field, existing?.delta, pending.delta),
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test packages/ui/src/sync/pending-part-deltas.test.ts packages/ui/src/sync/part-delta.test.ts
```

Expected: PASS.

---

### Task 6: Manual Browser Verification Against Cursor ACP

**Files:**
- No source changes.

- [ ] **Step 1: Restart/reload dev app**

Use the existing dev environment if still running. Otherwise run:

```bash
bun run dev
```

Open:

```text
http://127.0.0.1:3001/?session=ses_1c1e3de61ffeHHnmq6v5imiXNy
```

- [ ] **Step 2: Verify historical persisted duplicates are hidden**

Expected: previously duplicated text parts such as:

```text
Continuing implementation: creating the hook and history section, then wiring them into the shell.
Continuing implementation: creating the hook and history section, then wiring them into the shell.
```

render as one line only.

- [ ] **Step 3: Verify fresh streaming**

Submit:

```text
continue
```

Expected:
- Fresh assistant status text appears once.
- `Skipped malformed tool call "edit"...` may still appear once if OpenCode/adapter surfaces it as real provider text.
- No immediate exact duplicate status line.
- No jammed duplicate diagnostic like `...new_stringSkipped malformed tool call...`.

- [ ] **Step 4: Verify raw persisted records**

Run:

```bash
bun --eval 'const res=await fetch("http://127.0.0.1:3001/api/session/ses_1c1e3de61ffeHHnmq6v5imiXNy/message?limit=6"); const data=await res.json(); for (const rec of data) { console.log("---", rec.info?.role, rec.info?.id); for (const p of rec.parts||[]) if (p.type==="text") console.log((p.text||"").slice(0,500).replace(/\n/g,"\\n")); }'
```

Expected:
- Raw OpenCode records may still contain duplicates. That is acceptable for this DevRyan UI fix because the provider/OpenCode persistence is upstream of DevRyan.
- DevRyan display and sync store should normalize them after fetch.

---

### Task 7: Validation

**Files:**
- No new source changes.

- [ ] **Step 1: Run focused sync/message tests**

Run:

```bash
bun test packages/ui/src/sync/part-delta.test.ts \
  packages/ui/src/sync/event-pipeline.test.ts \
  packages/ui/src/sync/message-fetch.test.ts \
  packages/ui/src/sync/pending-part-deltas.test.ts \
  packages/ui/src/sync/__tests__/event-reducer.test.js \
  packages/ui/src/components/chat/message/partUtils.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run affected validation**

Run:

```bash
bun run validate:affected
```

Expected: PASS.

Use `validate:affected`, not just `validate:quick`, because this touches hot sync/event paths and fetched message materialization.

---

## Risks and Guardrails

- Do not suppress all duplicate text. Only collapse exact adjacent repeats with a minimum length. Short repeats like `ha ha`, confirmations like `Yes\nYes`, and non-adjacent repeated paragraphs should remain intact.
- Do not remove single `Tool loop guard...` or single `Skipped malformed tool call...` messages. Those represent real upstream failures and are still useful debugging information.
- Keep normalization pure and deterministic. No timers, no provider network calls, no rendering-only state.
- Keep the hot path bounded. The generic jammed-repeat scan must be gated by `MAX_DUPLICATE_SCAN_LENGTH`; for longer values, rely on line-based collapse only.
- Do not modify upstream OpenCode, Cursor provider repos, or any OpenChamber checkout.

## Self-Review

- Spec coverage: covers live coalesced deltas, reducer deltas, pending deltas, fetched persisted records, and browser verification.
- Placeholder scan: no `TBD`, no unspecified tests, no vague "handle edge cases" steps.
- Type consistency: shared utility names are consistent: `collapseExactAdjacentTextRepeats`, `appendStreamingTextDelta`, `coalescePartDeltaValue`, `normalizeFetchedMessageRecords`.
