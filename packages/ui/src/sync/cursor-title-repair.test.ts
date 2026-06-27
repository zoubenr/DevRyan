import { describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"
import type { State } from "./types"
import { INITIAL_STATE } from "./types"
import { getCursorAcpTitleRepair } from "./cursor-title-repair"

function state(overrides: Partial<State> = {}): State {
  return {
    ...INITIAL_STATE,
    message: {},
    part: {},
    session_status: {},
    session_diff: {},
    ...overrides,
  }
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "ses_1",
    title: "cursor-acp error: You've hit your Cursor usage limit",
    time: { created: 1, updated: 2 },
    ...overrides,
  } as Session
}

function message(id: string, role: Message["role"], completed = false, summary?: unknown): Message {
  return {
    id,
    sessionID: "ses_1",
    role,
    providerID: "cursor-acp",
    time: completed ? { created: 1, completed: 2 } : { created: 1 },
    ...(summary ? { summary } : {}),
  } as Message
}

function textPart(messageID: string, text: string): Part {
  return {
    id: `${messageID}_part`,
    type: "text",
    messageID,
    sessionID: "ses_1",
    text,
  } as Part
}

describe("getCursorAcpTitleRepair", () => {
  test("repairs raw prompt titles from the completed Cursor plan heading", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session({ title: 'in dashboard/professional change the text for "Reviews & Reputation" to "Revi...' })],
      message: {
        ses_1: [
          message("msg_user", "user"),
          message("msg_assistant", "assistant", true),
        ],
      },
      part: {
        msg_user: [textPart("msg_user", 'in dashboard/professional change the text for "Reviews & Reputation" to "Reviews"')],
        msg_assistant: [textPart("msg_assistant", [
          "Found the label in the provider sidebar nav.",
          "",
          "<!--plan-->",
          "",
          "# Rename Professional Reviews Nav Label",
          "",
          "## Context",
          "",
          "The professional dashboard label should be shortened.",
        ].join("\n"))],
      },
    }), "ses_1")

    expect(repair).toEqual({
      sessionId: "ses_1",
      title: "Rename Professional Reviews Nav Label",
    })
  })

  test("does not replace custom Cursor session titles", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session({ title: "Hand-written session title" })],
      message: {
        ses_1: [
          message("msg_user", "user"),
          message("msg_assistant", "assistant", true),
        ],
      },
      part: {
        msg_user: [textPart("msg_user", "find the services page")],
        msg_assistant: [textPart("msg_assistant", "<!--plan-->\n# Find Services Page")],
      },
    }), "ses_1")

    expect(repair).toBeNull()
  })

  test("repairs stale Cursor error titles after a completed assistant turn", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session()],
      message: {
        ses_1: [
          message("msg_user", "user"),
          message("msg_assistant", "assistant", true),
        ],
      },
      part: {
        msg_user: [textPart("msg_user", "Move profile fields into the basics tab")],
      },
    }), "ses_1")

    expect(repair).toEqual({
      sessionId: "ses_1",
      title: "Move profile fields into the basics tab",
    })
  })

  test("repairs stale Cursor error titles when mutation evidence exists", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session({ summary: { additions: 12, deletions: 0 } } as Partial<Session>)],
      message: {
        ses_1: [message("msg_user", "user")],
      },
      part: {
        msg_user: [textPart("msg_user", "Update the profile form")],
      },
    }), "ses_1")

    expect(repair?.title).toBe("Update profile form")
  })

  test("repairs generated new-session timestamp titles after a completed assistant turn", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session({ title: "New session - 2026-05-20T13:18:22.865Z" })],
      message: {
        ses_1: [
          message("msg_user", "user"),
          message("msg_assistant", "assistant", true),
        ],
      },
      part: {
        msg_user: [textPart("msg_user", "Remove the export pdf button")],
      },
    }), "ses_1")

    expect(repair).toEqual({
      sessionId: "ses_1",
      title: "Remove export PDF button",
    })
  })

  test("repairs route-scoped Cursor fix prompts after a completed assistant turn", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session({ title: "New session - 2026-05-21T18:23:18.956Z" })],
      message: {
        ses_1: [
          message("msg_user", "user"),
          message("msg_assistant", "assistant", true),
        ],
      },
      part: {
        msg_user: [textPart(
          "msg_user",
          "in /dashboard/professional/services, it shows that I have 0 services when I have a profession, primary specialty, and subspecialty selected, which means i should have at least some default services and inherited services. Fix this",
        )],
      },
    }), "ses_1")

    expect(repair).toEqual({
      sessionId: "ses_1",
      title: "Fix services",
    })
  })

  test("does not hide genuine Cursor error titles without completion or mutation evidence", () => {
    const repair = getCursorAcpTitleRepair(state({
      session: [session()],
      message: {
        ses_1: [message("msg_user", "user")],
      },
      part: {
        msg_user: [textPart("msg_user", "Update the profile form")],
      },
    }), "ses_1")

    expect(repair).toBeNull()
  })
})
