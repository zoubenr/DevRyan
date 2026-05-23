import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, mock, test } from "bun:test"

mock.module("../../MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}))

const { ReasoningTimelineBlock } = await import("./ReasoningPart")

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
})
