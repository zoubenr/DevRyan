import { describe, expect, test } from "bun:test"
import { shouldInterruptBeforeSubmit } from "./submitInterrupt"

describe("submit interrupt decision", () => {
  test("interrupts an explicit submit for a busy session", () => {
    expect(shouldInterruptBeforeSubmit({
      currentSessionId: "session-a",
      sessionPhase: "busy",
      queuedMessageCount: 0,
      queuedOnly: false,
    })).toBe(true)
  })

  test("interrupts a queued submit with queued messages for a busy session", () => {
    expect(shouldInterruptBeforeSubmit({
      currentSessionId: "session-a",
      sessionPhase: "busy",
      queuedMessageCount: 1,
      queuedOnly: true,
    })).toBe(true)
  })

  test("does not interrupt an explicit submit for an idle session", () => {
    expect(shouldInterruptBeforeSubmit({
      currentSessionId: "session-a",
      sessionPhase: "idle",
      queuedMessageCount: 0,
      queuedOnly: false,
    })).toBe(false)
  })

  test("does not interrupt without a current session", () => {
    expect(shouldInterruptBeforeSubmit({
      currentSessionId: null,
      sessionPhase: "busy",
      queuedMessageCount: 0,
      queuedOnly: false,
    })).toBe(false)
  })

  test("does not interrupt a queued-only call with no queued messages", () => {
    expect(shouldInterruptBeforeSubmit({
      currentSessionId: "session-a",
      sessionPhase: "busy",
      queuedMessageCount: 0,
      queuedOnly: true,
    })).toBe(false)
  })
})
