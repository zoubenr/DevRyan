import { describe, expect, test } from "bun:test"
import { dict } from "./en"

describe("context usage labels", () => {
  test("labels input tokens as model context instead of literal prompt input", () => {
    expect(dict["contextSidebar.tokens.input"]).toBe("Input context")
    expect(dict["contextSidebar.tokens.input"]).not.toBe("Input")
    expect(dict["contextUsage.window.tokenStatsHelp"]).toContain("not just the latest prompt")
  })
})
