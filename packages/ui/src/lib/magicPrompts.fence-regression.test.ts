import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { MAGIC_PROMPT_DEFINITIONS } from "./magicPrompts"

// Regression guard: when the legacy plan-card markdown parser was removed,
// the corresponding "wrap the plan in ```plan.md fences" instruction had to
// go too — otherwise the assistant produces fenced code blocks that the
// MarkdownRenderer shows as <pre><code> instead of typeset prose.
//
// If this test fails, someone reintroduced the fence instruction. Do NOT
// reintroduce the markdown parser to compensate. Update the prompt to keep
// asking for ordinary markdown.

const FORBIDDEN_FENCE_PATTERNS: ReadonlyArray<RegExp> = [
  /wrap (?:only )?the plan body in a fenced/i,
  /fenced markdown block whose opening fence is exactly/i,
  /\bopening fence is .*plan\.md/i,
]

describe("plan-mode prompts no longer require ```plan.md fences", () => {
  test("plan.todo.instructions does not instruct fenced plan output", () => {
    const def = MAGIC_PROMPT_DEFINITIONS.find((d) => d.id === "plan.todo.instructions")
    if (!def) throw new Error("plan.todo.instructions definition missing")
    const template = def.template
    for (const pattern of FORBIDDEN_FENCE_PATTERNS) {
      expect(pattern.test(template)).toBe(false)
    }
  })

  test("session-ui-store synthetic plan prompt does not instruct fenced plan output", () => {
    const source = readFileSync(new URL("../sync/session-ui-store.ts", import.meta.url), "utf8")
    for (const pattern of FORBIDDEN_FENCE_PATTERNS) {
      expect(pattern.test(source)).toBe(false)
    }
  })
})

describe("clarifying-question prompts use the structured question tool", () => {
  test("planning and issue-review prompts tell assistants to batch structured questions", () => {
    const promptIds = ["plan.todo.instructions", "github.issue.review.instructions"]

    for (const id of promptIds) {
      const def = MAGIC_PROMPT_DEFINITIONS.find((d) => d.id === id)
      if (!def) throw new Error(`${id} definition missing`)
      expect(def.template).toContain("structured question tool")
      expect(def.template).toContain("questions[]")
      expect(def.template).toContain("Never ask clarifying questions as free-form chat text")
    }
  })
})
