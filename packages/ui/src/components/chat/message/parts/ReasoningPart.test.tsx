import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, mock, test } from "bun:test"

mock.module("../../MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}))

const { ReasoningTimelineBlock, formatReasoningText } = await import("./ReasoningPart")

describe("ReasoningTimelineBlock", () => {
  test("renders reasoning text inline without a thinking header or timer", () => {
    const html = renderToStaticMarkup(
      <ReasoningTimelineBlock
        text={"First thought\n\nSecond thought"}
        variant="thinking"
        blockId="reasoning-inline"
        time={{ start: 1_000, end: 3_000 }}
        showDuration={true}
      />,
    )

    expect(html).toContain("First thought")
    expect(html).toContain("Second thought")
    expect(html).not.toContain("Thinking")
    expect(html).not.toContain("2.0s")
    expect(html).not.toContain("aria-expanded")
  })

  test("renders compact Cursor reasoning collapsed with full detail available", () => {
    const html = renderToStaticMarkup(
      <ReasoningTimelineBlock
        text={"First long Cursor thought\n\nSecond long Cursor thought"}
        variant="thinking"
        blockId="cursor-reasoning"
        time={{ start: 1_000, end: 3_000 }}
        compact={true}
      />,
    )

    expect(html).toContain("<details")
    expect(html).toContain("Thinking")
    expect(html).toContain("First long Cursor thought")
    expect(html).toContain("Second long Cursor thought")
  })

  test("formats reasoning without repeated skill/action status lines", () => {
    const noisy = "Exploring skills index I need to inspect the skills index."
    const useful = "The skills index determines which skill file should be loaded."

    expect(formatReasoningText(`${noisy}\n\n${useful}`)).toBe(useful)
  })

  test("formats reasoning without skill-conflict status lines", () => {
    const noisy = "Addressing skill conflicts I think I need to act here and consider how to apply systematic debugging to address the bug."
    const useful = "The orchestrator prompt conflicts with skills that require announcements."

    expect(formatReasoningText(`${noisy}\n\n${useful}`)).toBe(useful)
  })

  test("formats reasoning without skill-announcement conflict sections", () => {
    const noisy = "**Clarifying plan execution**\n\nThe user provided a brief plan. My skill indicates that I should save the plan and announce it, but the platform announcement policy is tool-only."
    const useful = "The final response should contain the concise plan only."

    expect(formatReasoningText(`${noisy}\n\n${useful}`)).toBe(useful)
  })
})
