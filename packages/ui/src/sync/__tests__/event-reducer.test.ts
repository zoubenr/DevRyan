import { describe, expect, test } from "bun:test"
import type { Event, Message, Part, PermissionRequest, QuestionRequest, Session, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { applyDirectoryEvent } from "../event-reducer"
import { INITIAL_STATE, type State } from "../types"

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

function deltaEvent(delta = "hello"): Event {
  return {
    type: "message.part.delta",
    properties: {
      messageID: "msg_1",
      partID: "prt_1",
      field: "text",
      delta,
    },
  } as Event
}

function partUpdatedEvent(text = "hello"): Event {
  return {
    type: "message.part.updated",
    properties: {
      part: {
        id: "prt_1",
        messageID: "msg_1",
        sessionID: "ses_1",
        type: "text",
        text,
      },
    },
  } as Event
}

function testSession(id: string, parentID?: string, revertMessageID?: string): Session {
  return {
    id,
    title: id,
    time: { created: 1, updated: 1 },
    ...(parentID ? { parentID } : {}),
    ...(revertMessageID ? { revert: { messageID: revertMessageID } } : {}),
  } as Session
}

function messageUpdatedEvent(message: Message): Event {
  return {
    type: "message.updated",
    properties: { info: message },
  } as Event
}

function testMessage(id: string, sessionID: string, role: Message["role"], created: number): Message {
  return {
    id,
    sessionID,
    role,
    time: { created },
  } as Message
}

describe("applyDirectoryEvent", () => {
  test("returns typed materialization when delta arrives before parts", () => {
    const result = applyDirectoryEvent(state(), deltaEvent())

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", messageID: "msg_1", partID: "prt_1" },
    })
  })

  test("returns typed materialization when delta part is missing", () => {
    const result = applyDirectoryEvent(
      state({ part: { msg_1: [{ id: "prt_2", messageID: "msg_1", type: "text", text: "" } as Part] } }),
      deltaEvent(),
    )

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", messageID: "msg_1", partID: "prt_1" },
    })
  })

  test("resolves session ID for missing delta materialization when message is known", () => {
    const result = applyDirectoryEvent(
      state({
        message: {
          ses_1: [testMessage("msg_1", "ses_1", "assistant", 1)],
        },
      }),
      deltaEvent(),
    )

    expect(result).toEqual({
      changed: false,
      materialization: { type: "incomplete-session-snapshot", sessionID: "ses_1", messageID: "msg_1", partID: "prt_1" },
    })
  })

  test("applies part update and requests materialization when owning message is absent", () => {
    const draft = state()
    const result = applyDirectoryEvent(draft, partUpdatedEvent())

    expect(draft.part.msg_1.map((item) => item.id)).toEqual(["prt_1"])
    expect(result).toEqual({
      changed: true,
      materialization: {
        type: "incomplete-session-snapshot",
        sessionID: "ses_1",
        messageID: "msg_1",
        partID: "prt_1",
      },
    })
  })

  test("applies part update without materialization when owning message exists", () => {
    const draft = state({
      message: { ses_1: [{ id: "msg_1", sessionID: "ses_1", role: "assistant", time: { created: 1 } } as never] },
    })
    const result = applyDirectoryEvent(draft, partUpdatedEvent())

    expect(draft.part.msg_1.map((item) => item.id)).toEqual(["prt_1"])
    expect(result).toBe(true)
  })

  test("does not duplicate delta text when a later part snapshot catches up", () => {
    const draft = state({
      message: { ses_1: [{ id: "msg_1", sessionID: "ses_1", role: "assistant", time: { created: 1 } } as never] },
    })

    expect(applyDirectoryEvent(draft, partUpdatedEvent("a"))).toBe(true)
    expect(applyDirectoryEvent(draft, deltaEvent("b"))).toBe(true)
    expect(applyDirectoryEvent(draft, partUpdatedEvent("ab"))).toBe(true)

    expect((draft.part.msg_1[0] as { text?: string }).text).toBe("ab")
  })

  test("skips duplicate session status events", () => {
    const draft = state()
    const busyStatus = { type: "busy" } as SessionStatus
    const event = {
      type: "session.status",
      properties: { sessionID: "ses_1", status: busyStatus },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    const statusRef = draft.session_status.ses_1

    expect(applyDirectoryEvent(draft, event)).toBe(false)
    expect(draft.session_status.ses_1).toBe(statusRef)
  })

  test("skips duplicate session idle events", () => {
    const draft = state()
    const event = {
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    const statusRef = draft.session_status.ses_1

    expect(applyDirectoryEvent(draft, event)).toBe(false)
    expect(draft.session_status.ses_1).toBe(statusRef)
  })

  test("skips duplicate session error idle-state events", () => {
    const draft = state()
    const event = {
      type: "session.error",
      properties: { sessionID: "ses_1" },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    const statusRef = draft.session_status.ses_1

    expect(applyDirectoryEvent(draft, event)).toBe(false)
    expect(draft.session_status.ses_1).toBe(statusRef)
  })

  test("clears busy status from terminal Cursor assistant message updates", () => {
    const draft = state({
      message: {
        ses_1: [{
          ...testMessage("msg_cursor_assistant", "ses_1", "assistant", 1),
          providerID: "cursor-acp",
        } as unknown as Message],
      },
      session_status: { ses_1: { type: "busy" } as SessionStatus },
    })

    const result = applyDirectoryEvent(draft, messageUpdatedEvent({
      ...testMessage("msg_cursor_assistant", "ses_1", "assistant", 1),
      providerID: "cursor-acp",
      finish: "stop",
      time: { created: 1, completed: 2 },
    } as unknown as Message))

    expect(result).toBe(true)
    expect(draft.session_status.ses_1).toEqual({ type: "idle" })
  })

  test("keeps session summary totals independent from session diff events", () => {
    const firstSummary = { additions: 5, deletions: 1, title: "first" }
    const secondSummary = { additions: 20, deletions: 4, title: "second" }
    const draft = state({
      session: [
        { ...testSession("ses_1"), summary: firstSummary } as unknown as Session,
        { ...testSession("ses_2"), summary: secondSummary } as unknown as Session,
      ],
    })

    const result = applyDirectoryEvent(draft, {
      type: "session.diff",
      properties: {
        sessionID: "ses_1",
        diff: [
          { file: "added.ts", additions: 12, deletions: 1 },
          { file: "removed.ts", additions: 3, deletions: 7 },
        ],
      },
    } as unknown as Event)

    expect(result).toBe(true)
    expect(draft.session_diff.ses_1).toEqual([
      { file: "added.ts", additions: 12, deletions: 1 },
      { file: "removed.ts", additions: 3, deletions: 7 },
    ])
    expect((draft.session[0] as Session & { summary?: typeof firstSummary }).summary).toBe(firstSummary)
    expect((draft.session[1] as Session & { summary?: typeof secondSummary }).summary).toBe(secondSummary)
  })

  test("preserves session summary reference for duplicate session diff payloads", () => {
    const summary = { additions: 15, deletions: 8, title: "preserved" }
    const diff = [{ file: "added.ts", additions: 15, deletions: 8 }]
    const draft = state({
      session: [{ ...testSession("ses_1"), summary } as unknown as Session],
      session_diff: { ses_1: diff },
    })

    const result = applyDirectoryEvent(draft, {
      type: "session.diff",
      properties: { sessionID: "ses_1", diff: [{ file: "added.ts", additions: 15, deletions: 8 }] },
    } as unknown as Event)

    expect(result).toBe(false)
    expect((draft.session[0] as Session & { summary?: typeof summary }).summary).toBe(summary)
  })

  test("strips untrusted diff totals from raw session updated snapshots without cached messages", () => {
    const draft = state({
      session: [
        {
          ...testSession("ses_1"),
          summary: { title: "preserve me", additions: 95, deletions: 3, files: 2 },
        } as unknown as Session,
      ],
    })

    const result = applyDirectoryEvent(draft, {
      type: "session.updated",
      properties: {
        info: {
          ...testSession("ses_1"),
          title: "new title",
          summary: { title: "preserve me", additions: 200, deletions: 40, files: 8 },
        },
      },
    } as unknown as Event)

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { title?: string; additions?: number; deletions?: number; files?: number } }).summary).toEqual({
      title: "preserve me",
    })
  })

  test("strips untrusted diff totals from raw session created snapshots without cached messages", () => {
    const draft = state()

    const result = applyDirectoryEvent(draft, {
      type: "session.created",
      properties: {
        info: {
          ...testSession("ses_1"),
          summary: { additions: 200, deletions: 40, files: 8 },
        },
      },
    } as unknown as Event)

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { additions?: number; deletions?: number; files?: number } }).summary).toBe(undefined)
  })

  test("normalizes raw session updated snapshots from cached scoped user message diffs", () => {
    const draft = state({
      session: [testSession("ses_1")],
      message: {
        ses_1: [
          {
            ...testMessage("msg_1", "ses_1", "user", 1),
            summary: { diffs: [{ additions: 3, deletions: 1 }] },
          } as unknown as Message,
          {
            ...testMessage("msg_2", "ses_1", "user", 2),
            summary: { additions: 500, deletions: 400 },
          } as unknown as Message,
        ],
      },
    })

    const result = applyDirectoryEvent(draft, {
      type: "session.updated",
      properties: {
        info: {
          ...testSession("ses_1"),
          summary: { additions: 200, deletions: 40, files: 8 },
        },
      },
    } as unknown as Event)

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { diffs?: Array<{ additions?: number; deletions?: number }> } }).summary).toEqual({
      diffs: [{ additions: 3, deletions: 1 }],
    })
  })

  test("updates only the owning session summary from scoped user message summaries", () => {
    const firstSummary = { diffs: [{ additions: 1, deletions: 2 }] }
    const secondSummary = { diffs: [{ additions: 10, deletions: 20 }] }
    const draft = state({
      session: [
        { ...testSession("ses_1"), summary: firstSummary } as unknown as Session,
        { ...testSession("ses_2"), summary: secondSummary } as unknown as Session,
      ],
      message: {
        ses_1: [
          {
            ...testMessage("msg_1", "ses_1", "user", 1),
            summary: { diffs: [{ additions: 3, deletions: 4 }, { additions: "2", deletions: "1" }] },
          } as unknown as Message,
        ],
      },
    })

    const result = applyDirectoryEvent(draft, messageUpdatedEvent({
      ...testMessage("msg_2", "ses_1", "user", 2),
      summary: { diffs: [{ additions: 7, deletions: 8 }] },
    } as unknown as Message))

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { diffs?: Array<{ additions?: number; deletions?: number }> } }).summary).toEqual({
      diffs: [{ additions: 12, deletions: 13 }],
    })
    expect((draft.session[1] as Session & { summary?: typeof secondSummary }).summary).toBe(secondSummary)
  })

  test("ignores bare user message summary totals when recomputing session totals", () => {
    const draft = state({
      session: [
        {
          ...testSession("ses_1"),
          summary: { diffs: [{ additions: 5, deletions: 1 }] },
        } as unknown as Session,
      ],
    })

    const result = applyDirectoryEvent(draft, messageUpdatedEvent({
      ...testMessage("msg_1", "ses_1", "user", 1),
      summary: { additions: 500, deletions: 400 },
    } as unknown as Message))

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { diffs?: unknown } }).summary).toBe(undefined)
  })

  test("clears stale session summary diff totals when loaded user messages have no scoped diffs", () => {
    const draft = state({
      session: [
        {
          ...testSession("ses_1"),
          summary: { additions: 95, deletions: 3, title: "stale worktree summary" },
        } as unknown as Session,
      ],
    })

    const result = applyDirectoryEvent(draft, messageUpdatedEvent(testMessage("msg_1", "ses_1", "user", 1)))

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { additions?: number; deletions?: number; title?: string } }).summary).toEqual({
      title: "stale worktree summary",
    })
  })

  test("recomputes session summary diff totals when a user message is removed", () => {
    const draft = state({
      session: [
        {
          ...testSession("ses_1"),
          summary: { additions: 12, deletions: 13 },
        } as unknown as Session,
      ],
      message: {
        ses_1: [
          {
            ...testMessage("msg_1", "ses_1", "user", 1),
            summary: { diffs: [{ additions: 5, deletions: 5 }] },
          } as unknown as Message,
          {
            ...testMessage("msg_2", "ses_1", "user", 2),
            summary: { diffs: [{ additions: 7, deletions: 8 }] },
          } as unknown as Message,
        ],
      },
    })

    const result = applyDirectoryEvent(draft, {
      type: "message.removed",
      properties: { sessionID: "ses_1", messageID: "msg_2" },
    } as Event)

    expect(result).toBe(true)
    expect((draft.session[0] as Session & { summary?: { diffs?: Array<{ additions?: number; deletions?: number }> } }).summary).toEqual({
      diffs: [{ additions: 5, deletions: 5 }],
    })
  })

  test("detects retry status metadata changes", () => {
    const draft = state({
      session_status: {
        ses_1: { type: "retry", attempt: 1, message: "rate limited", next: 10 } as SessionStatus,
      },
    })

    const event = {
      type: "session.status",
      properties: {
        sessionID: "ses_1",
        status: { type: "retry", attempt: 2, message: "rate limited", next: 20 } as SessionStatus,
      },
    } as Event

    expect(applyDirectoryEvent(draft, event)).toBe(true)
    expect((draft.session_status.ses_1 as Extract<SessionStatus, { type: "retry" }>).attempt).toBe(2)
  })

  test("indexes root user message timestamps for sidebar ordering", () => {
    const draft = state({ session: [testSession("ses_1")], session_user_activity: {} })

    expect(applyDirectoryEvent(draft, messageUpdatedEvent(testMessage("msg_1", "ses_1", "user", 123)))).toBe(true)

    expect(draft.session_user_activity).toEqual({ ses_1: 123 })
  })

  test("does not index assistant messages as user activity", () => {
    const draft = state({ session: [testSession("ses_1")], session_user_activity: {} })

    applyDirectoryEvent(draft, messageUpdatedEvent(testMessage("msg_1", "ses_1", "assistant", 456)))

    expect(draft.session_user_activity).toEqual({})
  })

  test("does not index child session user messages", () => {
    const draft = state({ session: [testSession("ses_child", "ses_parent")], session_user_activity: {} })

    applyDirectoryEvent(draft, messageUpdatedEvent(testMessage("msg_1", "ses_child", "user", 789)))

    expect(draft.session_user_activity).toEqual({})
  })

  test("recomputes user activity when revert hides the latest user message", () => {
    const draft = state({
      session: [testSession("ses_1")],
      message: {
        ses_1: [
          testMessage("msg_1", "ses_1", "user", 100),
          testMessage("msg_2", "ses_1", "assistant", 200),
          testMessage("msg_3", "ses_1", "user", 300),
        ],
      },
      session_user_activity: { ses_1: 300 },
    })

    applyDirectoryEvent(draft, {
      type: "session.updated",
      properties: { info: testSession("ses_1", undefined, "msg_3") },
    } as Event)

    expect(draft.session_user_activity).toEqual({ ses_1: 100 })
  })

  test("does not reinsert messages hidden by a pending revert transaction", () => {
    const draft = state({
      session: [testSession("ses_1", undefined, "msg_3")],
      message: {
        ses_1: [testMessage("msg_1", "ses_1", "user", 100)],
      },
      part: {},
      revert_transaction: {
        ses_1: {
          messageID: "msg_3",
          hiddenMessageIDs: ["msg_3", "msg_4"],
          version: 1,
          status: "pending",
          startedAt: 1,
        },
      },
      session_user_activity: { ses_1: 100 },
    })

    expect(applyDirectoryEvent(draft, messageUpdatedEvent(testMessage("msg_3", "ses_1", "user", 300)))).toBe(false)
    expect(draft.message.ses_1.map((message) => message.id)).toEqual(["msg_1"])
    expect(draft.session_user_activity).toEqual({ ses_1: 100 })
  })

  test("archives active session metadata without dropping recent message cache", () => {
    const draft = state({
      session: [testSession("ses_1")],
      message: { ses_1: [testMessage("msg_1", "ses_1", "user", 100)] },
      part: { msg_1: [{ id: "prt_1", messageID: "msg_1", sessionID: "ses_1", type: "text", text: "hello" } as Part] },
      session_status: { ses_1: { type: "idle" } as SessionStatus },
      session_user_activity: { ses_1: 100 },
      sessionTotal: 1,
    })

    expect(applyDirectoryEvent(draft, {
      type: "session.updated",
      properties: { info: { ...testSession("ses_1"), time: { created: 1, updated: 2, archived: 3 } } },
    } as Event)).toBe(true)

    expect(draft.session).toEqual([])
    expect(draft.message.ses_1.map((message) => message.id)).toEqual(["msg_1"])
    expect(draft.part.msg_1.map((part) => part.id)).toEqual(["prt_1"])
    expect(draft.session_status.ses_1).toEqual({ type: "idle" })
    expect(draft.session_user_activity.ses_1).toBe(undefined)
    expect(draft.sessionTotal).toBe(0)
  })

  test("updates permission request arrays immutably", () => {
    const initialPermissions = [
      { id: "perm_1", sessionID: "ses_1" } as PermissionRequest,
    ]
    const draft = state({ permission: { ses_1: initialPermissions } })

    applyDirectoryEvent(draft, {
      type: "permission.asked",
      properties: { id: "perm_2", sessionID: "ses_1" } as PermissionRequest,
    } as Event)

    expect(draft.permission.ses_1).not.toBe(initialPermissions)
    expect(draft.permission.ses_1.map((item) => item.id)).toEqual(["perm_1", "perm_2"])

    const afterAsk = draft.permission.ses_1
    applyDirectoryEvent(draft, {
      type: "permission.replied",
      properties: { sessionID: "ses_1", requestID: "perm_1" },
    } as Event)

    expect(draft.permission.ses_1).not.toBe(afterAsk)
    expect(draft.permission.ses_1.map((item) => item.id)).toEqual(["perm_2"])
  })

  test("updates question request arrays immutably", () => {
    const initialQuestions = [
      { id: "ques_1", sessionID: "ses_1" } as QuestionRequest,
    ]
    const draft = state({ question: { ses_1: initialQuestions } })

    applyDirectoryEvent(draft, {
      type: "question.asked",
      properties: { id: "ques_2", sessionID: "ses_1" } as QuestionRequest,
    } as Event)

    expect(draft.question.ses_1).not.toBe(initialQuestions)
    expect(draft.question.ses_1.map((item) => item.id)).toEqual(["ques_1", "ques_2"])

    const afterAsk = draft.question.ses_1
    applyDirectoryEvent(draft, {
      type: "question.replied",
      properties: { sessionID: "ses_1", requestID: "ques_1" },
    } as Event)

    expect(draft.question.ses_1).not.toBe(afterAsk)
    expect(draft.question.ses_1.map((item) => item.id)).toEqual(["ques_2"])

    const afterReply = draft.question.ses_1
    applyDirectoryEvent(draft, {
      type: "question.rejected",
      properties: { sessionID: "ses_1", requestID: "ques_2" },
    } as Event)

    expect(draft.question.ses_1).not.toBe(afterReply)
    expect(draft.question.ses_1).toEqual([])
  })

  test("does not trim the oldest session while it has a pending question", () => {
    const draft = state({
      limit: 1,
      session: [testSession("ses_1")],
      question: {
        ses_1: [{ id: "ques_1", sessionID: "ses_1" } as QuestionRequest],
      },
    })

    applyDirectoryEvent(draft, {
      type: "session.created",
      properties: { info: testSession("ses_2") },
    } as Event)

    expect(draft.session.map((session) => session.id)).toEqual(["ses_1", "ses_2"])
  })

  test("defers assistant text normalization while the session is busy", () => {
    const diagnosticSuffix = '\nSkipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string.'
    const draft = state({
      session: [testSession("ses_1")],
      message: {
        ses_1: [testMessage("msg_1", "ses_1", "assistant", 1)],
      },
      part: {
        msg_1: [{
          id: "prt_1",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "text",
          text: "before",
        } as Part],
      },
      session_status: { ses_1: { type: "busy" } as SessionStatus },
    })

    const result = applyDirectoryEvent(draft, partUpdatedEvent(`before${diagnosticSuffix}`))

    expect(result).toBe(true)
    expect((draft.part.msg_1[0] as { text?: string }).text).toBe(`before${diagnosticSuffix}`)
  })

  test("normalizes assistant text after the assistant message completes", () => {
    const diagnosticSuffix = '\nSkipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string.'
    const draft = state({
      session: [testSession("ses_1")],
      message: {
        ses_1: [testMessage("msg_1", "ses_1", "assistant", 1)],
      },
      part: {
        msg_1: [{
          id: "prt_1",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "text",
          text: `before${diagnosticSuffix}`,
        } as Part],
      },
      session_status: { ses_1: { type: "idle" } as SessionStatus },
    })

    applyDirectoryEvent(draft, messageUpdatedEvent({
      ...testMessage("msg_1", "ses_1", "assistant", 1),
      finish: "stop",
      time: { created: 1, completed: 2 },
    } as Message))

    expect((draft.part.msg_1[0] as { text?: string }).text).toBe("before")
  })
})
