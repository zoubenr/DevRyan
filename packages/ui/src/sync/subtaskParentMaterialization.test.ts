import { describe, expect, test } from "bun:test"
import type { Event, Session, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { INITIAL_STATE, type State } from "./types"
import {
  getTerminalSessionIdForParentMaterialization,
  resolveParentSessionIdForTerminalChild,
} from "./subtaskParentMaterialization"

function state(overrides: Partial<State> = {}): State {
  return {
    ...INITIAL_STATE,
    session: [],
    ...overrides,
  }
}

function session(id: string, parentID?: string): Session {
  return {
    id,
    title: id,
    time: { created: 1, updated: 1 },
    ...(parentID ? { parentID } : {}),
  } as Session
}

function sessionStatusEvent(sessionID: string, status: SessionStatus): Event {
  return {
    id: `evt_${sessionID}_${status.type}`,
    type: "session.status",
    properties: { sessionID, status },
  } as Event
}

describe("subtask parent materialization", () => {
  test("uses session.idle as a terminal child signal", () => {
    expect(getTerminalSessionIdForParentMaterialization({
      id: "evt_idle",
      type: "session.idle",
      properties: { sessionID: "ses_child" },
    } as Event)).toBe("ses_child")
  })

  test("uses session.error as a terminal child signal", () => {
    expect(getTerminalSessionIdForParentMaterialization({
      id: "evt_error",
      type: "session.error",
      properties: { sessionID: "ses_child" },
    } as Event)).toBe("ses_child")
  })

  test("uses session.status idle as a terminal child signal", () => {
    expect(getTerminalSessionIdForParentMaterialization(
      sessionStatusEvent("ses_child", { type: "idle" } as SessionStatus),
    )).toBe("ses_child")
  })

  test("ignores non-terminal session.status events", () => {
    expect(getTerminalSessionIdForParentMaterialization(
      sessionStatusEvent("ses_child", { type: "busy" } as SessionStatus),
    )).toBeNull()
    expect(getTerminalSessionIdForParentMaterialization(
      sessionStatusEvent("ses_child", { type: "retry", attempt: 1, message: "Retrying", next: 2 } as SessionStatus),
    )).toBeNull()
  })

  test("ignores unrelated events", () => {
    expect(getTerminalSessionIdForParentMaterialization({
      id: "evt_message",
      type: "message.updated",
      properties: { info: { id: "msg_1", sessionID: "ses_child" } },
    } as Event)).toBeNull()
  })

  test("resolves the authoritative parent session for a terminal child", () => {
    expect(resolveParentSessionIdForTerminalChild(state({
      session: [
        session("ses_parent"),
        session("ses_child", "ses_parent"),
      ],
    }), "ses_child")).toBe("ses_parent")
  })

  test("does not guess a parent for root or unknown sessions", () => {
    const syncState = state({ session: [session("ses_root")] })

    expect(resolveParentSessionIdForTerminalChild(syncState, "ses_root")).toBeNull()
    expect(resolveParentSessionIdForTerminalChild(syncState, "ses_missing")).toBeNull()
  })
})
