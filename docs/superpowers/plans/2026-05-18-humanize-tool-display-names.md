# Humanize Tool Display Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display unknown MCP/tool names like `Linear_get_issue` and `Council_session` as `Linear get issue` and `Council session` without changing the underlying tool identifiers used for execution, permissions, grouping, or API calls.

**Architecture:** Add one shared display-only formatter in `packages/ui/src/lib/toolHelpers.ts` and use it only at user-facing render boundaries. Keep existing tool-name normalization functions unchanged because they drive behavior, grouping, metadata lookup, and special-case rendering.

**Tech Stack:** React, TypeScript, Bun test runner, shared UI package.

---

## File Structure

- Modify `packages/ui/src/lib/toolHelpers.ts`
  - Add `formatUnknownToolDisplayName(toolName: string): string`.
  - Use it only in the fallback branch of `getToolMetadata()`.
- Modify `packages/ui/src/lib/toolHelpers.test.ts`
  - Add focused unit tests for underscore/hyphen display formatting and known-tool preservation.
- Modify `packages/ui/src/components/chat/PermissionCard.tsx`
  - Import `formatUnknownToolDisplayName`.
  - Use it only in the fallback return of the local permission display-name function.
- Modify `packages/ui/src/hooks/useAssistantStatus.ts`
  - Import `formatUnknownToolDisplayName`.
  - Format the fallback activity/status tool name while preserving the raw `part.tool` everywhere else.

## Non-Goals

- Do not rename MCP commands, OpenCode tool ids, permission ids, config keys, or server payloads.
- Do not change `normalizeToolName()` in `ToolPart.tsx`, `ChatMessage.tsx`, or `tool-activity/classification.ts`; those are behavior-oriented paths.
- Do not add provider-specific mappings for Linear or Council. This should work for any unknown tool name with separators.
- Do not title-case every word. The requested output is sentence-like: `Linear get issue`, not `Linear Get Issue`.

## Task 1: Add Shared Display Formatter

**Files:**
- Modify: `packages/ui/src/lib/toolHelpers.ts`
- Test: `packages/ui/src/lib/toolHelpers.test.ts`

- [ ] **Step 1: Write failing tests for unknown tool display names**

Update `packages/ui/src/lib/toolHelpers.test.ts` to import the new formatter and assert the desired display behavior:

```ts
import { describe, expect, test } from "bun:test";
import { formatUnknownToolDisplayName, getToolMetadata } from "./toolHelpers";

describe("getToolMetadata", () => {
  test("labels skill tool activity as loading a skill", () => {
    expect(getToolMetadata("skill").displayName).toBe("Loading Skill:");
  });

  test("formats unknown underscore-separated MCP tool names for display", () => {
    expect(getToolMetadata("Linear_get_issue").displayName).toBe("Linear get issue");
    expect(getToolMetadata("Council_session").displayName).toBe("Council session");
  });
});

describe("formatUnknownToolDisplayName", () => {
  test("humanizes underscores and repeated separators without changing word casing beyond the first word", () => {
    expect(formatUnknownToolDisplayName("linear_get_issue")).toBe("Linear get issue");
    expect(formatUnknownToolDisplayName("Linear__get---issue")).toBe("Linear get issue");
    expect(formatUnknownToolDisplayName("MCP_get_issue")).toBe("MCP get issue");
  });

  test("falls back to Tool for empty or whitespace-only names", () => {
    expect(formatUnknownToolDisplayName("")).toBe("Tool");
    expect(formatUnknownToolDisplayName("   ")).toBe("Tool");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun test packages/ui/src/lib/toolHelpers.test.ts
```

Expected: FAIL because `formatUnknownToolDisplayName` is not exported yet and `getToolMetadata("Linear_get_issue")` still returns a raw underscore name.

- [ ] **Step 3: Implement the display-only formatter**

In `packages/ui/src/lib/toolHelpers.ts`, add this helper before `getToolMetadata()`:

```ts
export function formatUnknownToolDisplayName(toolName: string): string {
  const normalized = toolName
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return "Tool";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
```

Then change the fallback branch in `getToolMetadata()` from:

```ts
displayName: toolName.charAt(0).toUpperCase() + toolName.slice(1).replace(/-/g, ' '),
```

to:

```ts
displayName: formatUnknownToolDisplayName(toolName),
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
bun test packages/ui/src/lib/toolHelpers.test.ts
```

Expected: PASS.

## Task 2: Apply Formatter to Permission Prompt Fallback

**Files:**
- Modify: `packages/ui/src/components/chat/PermissionCard.tsx`
- Test: `packages/ui/src/lib/toolHelpers.test.ts`

- [ ] **Step 1: Confirm permission prompts keep raw identifiers for behavior**

In `packages/ui/src/components/chat/PermissionCard.tsx`, confirm these lines still use the raw permission name:

```ts
const toolName = permission.permission || 'unknown';
const tool = toolName.toLowerCase();
```

This must stay unchanged because `tool` drives permission content rendering and icon special cases.

- [ ] **Step 2: Import the shared formatter**

Add this import near the other local imports:

```ts
import { formatUnknownToolDisplayName } from '@/lib/toolHelpers';
```

- [ ] **Step 3: Use the formatter only in the display fallback**

Change the final fallback in `getToolDisplayName()` from:

```ts
return toolName;
```

to:

```ts
return formatUnknownToolDisplayName(toolName);
```

Do not change any earlier branches for `edit`, `write`, `bash`, or `webfetch`.

- [ ] **Step 4: Run type checking for the touched package surface**

Run:

```bash
bun run validate:quick
```

Expected: PASS. If changed-file detection chooses only the UI package, that is acceptable for this display-only change.

## Task 3: Apply Formatter to Assistant Activity Status

**Files:**
- Modify: `packages/ui/src/hooks/useAssistantStatus.ts`
- Test: `packages/ui/src/lib/toolHelpers.test.ts`

- [ ] **Step 1: Import the shared formatter**

In `packages/ui/src/hooks/useAssistantStatus.ts`, add:

```ts
import { formatUnknownToolDisplayName } from '@/lib/toolHelpers';
```

- [ ] **Step 2: Format only the returned display string**

Change `getToolDisplayName(part: ToolPart)` from:

```ts
const getToolDisplayName = (part: ToolPart): string => {
    if (part.tool) {
        return part.tool;
    }
    const candidate = part as ToolPart & Partial<{ name?: unknown }>;
    return typeof candidate.name === 'string' ? candidate.name : 'tool';
};
```

to:

```ts
const getToolDisplayName = (part: ToolPart): string => {
    if (part.tool) {
        return formatUnknownToolDisplayName(part.tool);
    }
    const candidate = part as ToolPart & Partial<{ name?: unknown }>;
    return typeof candidate.name === 'string' ? formatUnknownToolDisplayName(candidate.name) : 'Tool';
};
```

This keeps the raw tool value on `part.tool` intact and only formats the string used for status text.

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun test packages/ui/src/lib/toolHelpers.test.ts
```

Expected: PASS.

## Task 4: Guard Against Accidental Behavior Changes

**Files:**
- Inspect only: `packages/ui/src/components/chat/message/parts/ToolPart.tsx`
- Inspect only: `packages/ui/src/components/chat/message/parts/StaticToolRow.tsx`
- Inspect only: `packages/ui/src/components/chat/message/parts/tool-activity/classification.ts`
- Inspect only: `packages/ui/src/components/chat/ChatMessage.tsx`

- [ ] **Step 1: Verify no behavior-oriented normalization was changed**

Confirm the implementation did not edit these functions:

```ts
normalizeToolName(...)
isExpandableTool(...)
isStandaloneTool(...)
isStaticTool(...)
```

Expected: No diffs in behavior-oriented normalization paths.

- [ ] **Step 2: Verify existing known tool names still use explicit metadata**

Run:

```bash
bun test packages/ui/src/lib/toolHelpers.test.ts
```

Expected: PASS, including:

```ts
expect(getToolMetadata("skill").displayName).toBe("Loading Skill:");
```

This confirms known tools still use `TOOL_METADATA` and do not go through the unknown-tool fallback.

## Task 5: Final Validation

**Files:**
- No additional file changes expected.

- [ ] **Step 1: Run quick validation**

Run:

```bash
bun run validate:quick
```

Expected: PASS.

- [ ] **Step 2: Manually check representative examples in the UI if a dev server is already available**

Trigger or inspect tool activity labels for these raw names:

```txt
Linear_get_issue
Council_session
linear_get_issue
MCP_get_issue
```

Expected display labels:

```txt
Linear get issue
Council session
Linear get issue
MCP get issue
```

Raw names should still appear in data payloads, permission ids, logs, and matching logic where those systems require exact identifiers.

## Risk Notes

- The main breakage risk is using the formatter before behavioral checks. Avoid this by formatting only at render/status boundaries.
- Tool metadata lookup still receives normalized lowercase names in several message paths. That is fine: unknown lowercase names like `linear_get_issue` will display as `Linear get issue`.
- Existing explicit labels in `TOOL_METADATA`, such as `Read File`, `Shell Command`, and `Loading Skill:`, remain authoritative.

