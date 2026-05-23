import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { mergeOptimisticPage } from "./optimistic"

function message(id: string, role: Message["role"] = "assistant"): Message {
  return { id, sessionID: "ses_1", role, time: { created: 1 } } as Message
}

function part(id: string, messageID: string, type = "text"): Part {
  return { id, messageID, sessionID: "ses_1", type, text: id } as Part
}

describe("mergeOptimisticPage", () => {
  test("preserves fetched server part order while merging optimistic messages", () => {
    const serverParts = [
      part("msg_1_assistant_text", "msg_1", "text"),
      part("msg_1_assistant_tool_b", "msg_1", "tool"),
      part("msg_1_assistant_reasoning", "msg_1", "reasoning"),
      part("msg_1_assistant_tool_a", "msg_1", "tool"),
    ]

    const result = mergeOptimisticPage(
      {
        session: [message("msg_1")],
        part: [{ id: "msg_1", part: serverParts }],
        complete: true,
      },
      [{
        message: message("msg_2", "user"),
        parts: [part("msg_2_user_text", "msg_2", "text")],
      }],
    )

    expect(result.part.find((item) => item.id === "msg_1")?.part.map((item) => item.id)).toEqual(
      serverParts.map((item) => item.id),
    )
  })
})
