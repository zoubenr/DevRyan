import { describe, expect, test } from "bun:test"

import { resolveUserMessageRevertSessionId } from "./chatMessageActions"

describe("resolveUserMessageRevertSessionId", () => {
  test("prefers the clicked message session over the visible session", () => {
    expect(resolveUserMessageRevertSessionId("message-session", "visible-session")).toBe("message-session")
  })

  test("falls back to the visible session when the clicked message has no session", () => {
    expect(resolveUserMessageRevertSessionId(undefined, "visible-session")).toBe("visible-session")
  })

  test("returns null when no usable session id exists", () => {
    expect(resolveUserMessageRevertSessionId("", "   ")).toBeNull()
  })
})
