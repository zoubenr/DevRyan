import { describe, expect, test } from "bun:test"
import { classifyAssistantError } from "./assistantError"

describe("classifyAssistantError", () => {
  test("shows stopped copy only for the locally stopped assistant message", () => {
    expect(classifyAssistantError({ message: "aborted" }, {
      manualAbortMessageId: "msg-assistant",
      messageId: "msg-assistant",
    })).toEqual({
      text: "The running turn was stopped.",
      variant: "plain",
      abortKind: "manual",
    })
  })

  test("treats aborted errors for a different trailing message as unexpected aborts", () => {
    expect(classifyAssistantError({ message: "aborted" }, {
      manualAbortMessageId: "msg-previous-assistant",
      messageId: "msg-next-assistant",
      isLatestMessage: true,
    })).toEqual({
      text: "The turn stopped before completion. Reconnecting session state…",
      variant: "info",
      abortKind: "unexpected",
    })
  })

  test("does not surface historical uncorrelated aborted messages", () => {
    expect(classifyAssistantError({ message: "aborted" }, {
      manualAbortMessageId: "msg-previous-assistant",
      messageId: "msg-next-assistant",
      isLatestMessage: false,
    })).toBe(undefined)
  })
})
