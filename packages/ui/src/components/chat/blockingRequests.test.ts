import { describe, expect, test } from "bun:test"
import type { PermissionRequest, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import type { State } from "@/sync/types"
import { INITIAL_STATE } from "@/sync/types"
import {
  collectVisibleSessionIdsForBlockingRequests,
  createScopedBlockingRequestsSelector,
} from "./lib/blockingRequests"

const session = (id: string, parentID?: string): Session => ({
  id,
  parentID,
  title: id,
  time: { created: 1, updated: 1 },
  version: "1",
} as Session)

const question = (id: string, sessionID: string): QuestionRequest => ({
  id,
  sessionID,
  questions: [{ header: "Q", question: "Continue?", options: [{ label: "Yes", description: "" }] }],
} as QuestionRequest)

const permission = (id: string, sessionID: string): PermissionRequest => ({
  id,
  sessionID,
  permission: "bash",
  patterns: [],
  metadata: {},
  always: [],
} as PermissionRequest)

const state = (overrides: Partial<State>): State => ({
  ...INITIAL_STATE,
  ...overrides,
})

describe("blocking request session scoping", () => {
  test("includes child-session requests only when the child relationship is known", () => {
    expect(collectVisibleSessionIdsForBlockingRequests([
      session("parent"),
      session("child", "parent"),
    ], "parent")).toEqual(["parent", "child"])

    expect(collectVisibleSessionIdsForBlockingRequests([
      session("parent"),
      session("orphan"),
    ], "parent")).toEqual(["parent"])
  })

  test("selects current-session question and permission requests even with no messages", () => {
    const selector = createScopedBlockingRequestsSelector("ses_a")
    const selected = selector(state({
      session: [session("ses_a")],
      message: {},
      part: {},
      question: { ses_a: [question("que_1", "ses_a")] },
      permission: { ses_a: [permission("perm_1", "ses_a")] },
    }))

    expect(selected.questions.map((entry) => entry.id)).toEqual(["que_1"])
    expect(selected.permissions.map((entry) => entry.id)).toEqual(["perm_1"])
  })

  test("surfaces child-session multiple-choice questions in the parent chat", () => {
    const selector = createScopedBlockingRequestsSelector<PermissionRequest, QuestionRequest>("parent")
    const childQuestion = {
      ...question("que_child", "child"),
      questions: [{
        header: "Decision",
        question: "Which path should the subagent take?",
        options: [
          { label: "Narrow fix (Recommended)", description: "Keep the change scoped." },
          { label: "Broad cleanup", description: "Refactor nearby code too." },
        ],
      }],
    } as QuestionRequest

    const selected = selector(state({
      session: [session("parent"), session("child", "parent")],
      question: { child: [childQuestion] },
    }))

    expect(selected.questions).toEqual([childQuestion])
    expect(selected.questions[0].questions[0].options.map((option) => option.label)).toEqual([
      "Narrow fix (Recommended)",
      "Broad cleanup",
    ])
  })

  test("returns the same reference for unrelated message or status changes", () => {
    const selector = createScopedBlockingRequestsSelector("ses_a")
    const baseQuestion = question("que_1", "ses_a")
    const first = selector(state({
      session: [session("ses_a")],
      question: { ses_a: [baseQuestion] },
    }))
    const second = selector(state({
      session: [session("ses_a")],
      question: { ses_a: [baseQuestion] },
      message: { other: [{ id: "msg_other", sessionID: "other", role: "assistant" } as never] },
      session_status: { other: { type: "busy" } as never },
    }))

    expect(second).toBe(first)
  })
})
