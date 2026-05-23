import { describe, expect, test } from "bun:test"
import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { resolveSessionActivityState } from "./useSessionActivity"

const incompleteAssistant = {
  id: "msg_assistant",
  role: "assistant",
  time: { created: 1 },
} as Message

describe("resolveSessionActivityState", () => {
  test("returns busy for a directory-specific busy status", () => {
    const result = resolveSessionActivityState({
      sessionId: "session-child",
      status: { type: "busy" } as SessionStatus,
      messages: [],
      permissions: [],
    })

    expect(result.phase).toBe("busy")
    expect(result.isWorking).toBe(true)
    expect(result.isBusy).toBe(true)
  })

  test("falls back to a trailing incomplete assistant message when status is missing", () => {
    const result = resolveSessionActivityState({
      sessionId: "session-child",
      status: undefined,
      messages: [incompleteAssistant],
      permissions: [],
    })

    expect(result.phase).toBe("busy")
    expect(result.isWorking).toBe(true)
  })

  test("authoritative idle wins over stale incomplete assistant history", () => {
    const result = resolveSessionActivityState({
      sessionId: "session-child",
      status: { type: "idle" } as SessionStatus,
      messages: [incompleteAssistant],
      permissions: [],
    })

    expect(result.phase).toBe("idle")
    expect(result.isWorking).toBe(false)
  })

  test("ignores stale incomplete assistant history when a later assistant message completed", () => {
    const completedAssistant = {
      id: "msg_assistant_done",
      role: "assistant",
      time: { created: 1, completed: 2 },
    } as Message

    const result = resolveSessionActivityState({
      sessionId: "session-child",
      status: undefined,
      messages: [incompleteAssistant, completedAssistant],
      permissions: [],
    })

    expect(result.phase).toBe("idle")
    expect(result.isWorking).toBe(false)
  })
})
