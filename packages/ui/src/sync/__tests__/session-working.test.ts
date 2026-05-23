import { describe, expect, test } from "bun:test"
import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { isSessionWorkingFromState } from "../session-working"

function assistantMessage(id: string, completed?: number): Message {
  return {
    id,
    role: "assistant",
    time: completed === undefined ? { created: 1 } : { created: 1, completed },
  } as Message
}

describe("isSessionWorkingFromState", () => {
  test("trusts authoritative idle status over incomplete assistant messages", () => {
    expect(isSessionWorkingFromState({
      status: { type: "idle" } as SessionStatus,
      permissions: [],
      messages: [assistantMessage("msg_assistant_1")],
    })).toBe(false)
  })

  test("uses incomplete assistant messages as a fallback when status is missing", () => {
    expect(isSessionWorkingFromState({
      status: undefined,
      permissions: [],
      messages: [assistantMessage("msg_assistant_1")],
    })).toBe(true)
  })

  test("ignores stale incomplete assistant history when a later assistant message completed", () => {
    expect(isSessionWorkingFromState({
      status: undefined,
      permissions: [],
      messages: [
        assistantMessage("msg_assistant_old"),
        assistantMessage("msg_assistant_new", 2),
      ],
    })).toBe(false)
  })

  test("returns true for authoritative working statuses", () => {
    expect(isSessionWorkingFromState({
      status: { type: "busy" } as SessionStatus,
      permissions: [],
      messages: [assistantMessage("msg_assistant_1", 2)],
    })).toBe(true)
  })

  test("lets pending permissions take priority over working indicators", () => {
    expect(isSessionWorkingFromState({
      status: { type: "busy" } as SessionStatus,
      permissions: [{}],
      messages: [assistantMessage("msg_assistant_1")],
    })).toBe(false)
  })
})
