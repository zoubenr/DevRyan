import { describe, expect, test } from "bun:test"
import type { Message, Part, PermissionRequest, QuestionRequest, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { INITIAL_STATE, type State } from "./types"
import { shouldSettlePlanProposalStatus } from "./plan-idle-settlement"

const SESSION_ID = "ses_1"
const USER_ID = "msg_1_user"
const PLAN_ASSISTANT_ID = "msg_2_assistant"

const userMessage = (id: string, created: number): Message => ({
  id,
  sessionID: SESSION_ID,
  role: "user",
  time: { created },
} as Message)

const assistantMessage = (id: string, created: number, completed?: number): Message => ({
  id,
  sessionID: SESSION_ID,
  role: "assistant",
  time: completed === undefined ? { created } : { created, completed },
} as Message)

const toolPart = (messageID: string, status: "pending" | "running" | "completed"): Part => ({
  id: `${messageID}_tool`,
  sessionID: SESSION_ID,
  messageID,
  type: "tool",
  tool: "read",
  state: { status },
} as Part)

const buildState = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE,
  session_status: { [SESSION_ID]: { type: "busy" } as SessionStatus },
  message: {
    [SESSION_ID]: [
      userMessage(USER_ID, 1),
      assistantMessage(PLAN_ASSISTANT_ID, 2, 3),
    ],
  },
  ...overrides,
})

const shouldSettle = (
  state: State,
  options: {
    sourceMessageId?: string
    planState?: "proposed" | "implementing" | "completed"
    implemented?: Set<string>
  } = {},
) => shouldSettlePlanProposalStatus({
  sessionID: SESSION_ID,
  state,
  sourceMessageId: options.sourceMessageId ?? PLAN_ASSISTANT_ID,
  planEntry: {
    state: options.planState ?? "proposed",
    sourceMessageId: options.sourceMessageId ?? PLAN_ASSISTANT_ID,
  },
  implementedPlanRequests: options.implemented ?? new Set(),
})

describe("shouldSettlePlanProposalStatus", () => {
  test("settles a completed terminal plan proposal with stale busy status", () => {
    expect(shouldSettle(buildState())).toBe(true)
  })

  test("does not settle when status is already idle", () => {
    expect(shouldSettle(buildState({
      session_status: { [SESSION_ID]: { type: "idle" } as SessionStatus },
    }))).toBe(false)
  })

  test("does not settle retry or missing status", () => {
    expect(shouldSettle(buildState({
      session_status: { [SESSION_ID]: { type: "retry" } as SessionStatus },
    }))).toBe(false)

    expect(shouldSettle(buildState({ session_status: {} }))).toBe(false)
  })

  test("does not settle when the plan is no longer proposed", () => {
    expect(shouldSettle(buildState(), { planState: "implementing" })).toBe(false)
    expect(shouldSettle(buildState(), { planState: "completed" })).toBe(false)
  })

  test("does not settle when implementation was requested for the plan", () => {
    expect(shouldSettle(buildState(), {
      implemented: new Set([`${SESSION_ID}:${PLAN_ASSISTANT_ID}:plan:0`]),
    })).toBe(false)
  })

  test("does not settle with pending permission or question blockers", () => {
    expect(shouldSettle(buildState({
      permission: { [SESSION_ID]: [{} as PermissionRequest] },
    }))).toBe(false)

    expect(shouldSettle(buildState({
      question: { [SESSION_ID]: [{} as QuestionRequest] },
    }))).toBe(false)
  })

  test("does not settle when the assistant message is not complete", () => {
    expect(shouldSettle(buildState({
      message: {
        [SESSION_ID]: [
          userMessage(USER_ID, 1),
          assistantMessage(PLAN_ASSISTANT_ID, 2),
        ],
      },
    }))).toBe(false)
  })

  test("does not settle when a newer visible message follows the plan", () => {
    expect(shouldSettle(buildState({
      message: {
        [SESSION_ID]: [
          userMessage(USER_ID, 1),
          assistantMessage(PLAN_ASSISTANT_ID, 2, 3),
          userMessage("msg_3_user", 4),
        ],
      },
    }))).toBe(false)
  })

  test("does not settle when the trailing assistant has pending or running tools", () => {
    expect(shouldSettle(buildState({
      part: { [PLAN_ASSISTANT_ID]: [toolPart(PLAN_ASSISTANT_ID, "pending")] },
    }))).toBe(false)

    expect(shouldSettle(buildState({
      part: { [PLAN_ASSISTANT_ID]: [toolPart(PLAN_ASSISTANT_ID, "running")] },
    }))).toBe(false)
  })

  test("settles when the trailing assistant has only completed tools", () => {
    expect(shouldSettle(buildState({
      part: { [PLAN_ASSISTANT_ID]: [toolPart(PLAN_ASSISTANT_ID, "completed")] },
    }))).toBe(true)
  })
})
