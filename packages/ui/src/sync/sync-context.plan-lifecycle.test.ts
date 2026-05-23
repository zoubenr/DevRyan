import { beforeEach, describe, expect, mock, test } from "bun:test"

mock.module("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: () => ({ isSessionAutoAccepting: () => false }),
  },
}))

mock.module("@/stores/useTodosPersistStore", () => ({
  useTodosPersistStore: { getState: () => ({ setSessionTodos: () => undefined }) },
}))

mock.module("@/components/ui", () => ({
  toast: { info: () => undefined, error: () => undefined, success: () => undefined, dismiss: () => undefined },
}))

import type { Event, Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { ChildStoreManager } from "./child-store"
import { INITIAL_STATE } from "./types"
import { useSessionUIStore } from "./session-ui-store"
import { applySyncEventForTest } from "./sync-context"
import { useNotificationStore } from "./notification-store"

const DIRECTORY = "/repo"
const SESSION_ID = "ses_1"
const USER_MESSAGE_ID = "msg_1_user"
const ASSISTANT_MESSAGE_ID = "msg_2_assistant"
const PART_ID = "prt_assistant_1"
const IMPLEMENT_USER_MESSAGE_ID = "msg_3_implement_user"
const IMPLEMENT_ASSISTANT_MESSAGE_ID = "msg_4_implement_assistant"
const IMPLEMENT_PART_ID = "prt_implement_assistant_1"

const structuredPlanBody = [
  "# Cursor Plan Indicator Fix",
  "",
  "## Context",
  "",
  "Cursor models omit the sentinel.",
  "",
  "## Implementation",
  "",
  "1. Add fallback detection.",
  "",
  "## Verification",
  "",
  "1. Run tests.",
].join("\n")

const userMessage = (): Message => ({
  id: USER_MESSAGE_ID,
  sessionID: SESSION_ID,
  role: "user",
  time: { created: 1 },
} as Message)

const assistantMessage = (): Message => ({
  id: ASSISTANT_MESSAGE_ID,
  sessionID: SESSION_ID,
  role: "assistant",
  providerID: "cursor-acp",
  time: { created: 2, completed: 3 },
} as Message)

const implementingUserMessage = (): Message => ({
  id: IMPLEMENT_USER_MESSAGE_ID,
  sessionID: SESSION_ID,
  role: "user",
  time: { created: 4 },
} as Message)

const implementingAssistantMessage = (completed = 6): Message => ({
  id: IMPLEMENT_ASSISTANT_MESSAGE_ID,
  sessionID: SESSION_ID,
  role: "assistant",
  providerID: "cursor-acp",
  time: { created: 5, completed },
} as Message)

const textPart = (text: string): Part => ({
  id: PART_ID,
  sessionID: SESSION_ID,
  messageID: ASSISTANT_MESSAGE_ID,
  type: "text",
  text,
} as Part)

const implementTextPart = (text: string): Part => ({
  id: IMPLEMENT_PART_ID,
  sessionID: SESSION_ID,
  messageID: IMPLEMENT_ASSISTANT_MESSAGE_ID,
  type: "text",
  text,
} as Part)

const planModePart = (): Part => ({
  id: `${USER_MESSAGE_ID}_part`,
  sessionID: SESSION_ID,
  messageID: USER_MESSAGE_ID,
  type: "text",
  text: "User has requested to enter plan mode.",
  synthetic: true,
} as Part)

const deltaEvent = (delta: string): Event => ({
  type: "message.part.delta",
  properties: {
    messageID: ASSISTANT_MESSAGE_ID,
    partID: PART_ID,
    field: "text",
    delta,
  },
} as Event)

const partUpdatedEvent = (part: Part): Event => ({
  type: "message.part.updated",
  properties: { part },
} as Event)

const routingIndexFor = (messageIds: string[] = [USER_MESSAGE_ID, ASSISTANT_MESSAGE_ID]) => ({
  sessionDirectoryById: new Map([[SESSION_ID, DIRECTORY]]),
  messageSessionById: new Map(messageIds.map((messageId) => [messageId, SESSION_ID])),
  sessionMessageIdsById: new Map([[SESSION_ID, new Set(messageIds)]]),
})

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("sync plan lifecycle on message.part.delta", () => {
  beforeEach(() => {
    useSessionUIStore.setState({
      sessionPlanIndicator: new Map(),
      sessionPlanAvailable: new Map(),
      implementedPlanRequests: new Set(),
      planModeUserMessages: new Set(),
      planModeUserMessagesBySession: new Map(),
    })
    useNotificationStore.setState({
      list: [],
      index: {
        session: { unseenCount: {}, unseenHasError: {}, unseenHasCompletion: {} },
        project: { unseenCount: {}, unseenHasError: {}, unseenHasCompletion: {} },
      },
    })
  })

  test("marks sessionPlanIndicator proposed when structured plan text arrives via delta on an idle session", async () => {
    const childStores = new ChildStoreManager()
    const store = childStores.ensureChild(DIRECTORY)
    const session = {
      id: SESSION_ID,
      title: "Plan session",
      time: { created: 1, updated: 2 },
    } as Session

    store.setState({
      ...INITIAL_STATE,
      session: [session],
      message: {
        [SESSION_ID]: [userMessage(), assistantMessage()],
      },
      part: {
        [USER_MESSAGE_ID]: [planModePart()],
        [ASSISTANT_MESSAGE_ID]: [textPart("")],
      },
      session_status: {
        [SESSION_ID]: { type: "idle" } as SessionStatus,
      },
    })

    useSessionUIStore.getState().recordUserMessagePlanMode(SESSION_ID, USER_MESSAGE_ID, true)

    const routingIndex = routingIndexFor()

    applySyncEventForTest(DIRECTORY, deltaEvent(structuredPlanBody), childStores, routingIndex)
    await flushAsync()

    expect(useSessionUIStore.getState().sessionPlanIndicator.get(SESSION_ID)).toEqual({
      state: "proposed",
      sourceMessageId: ASSISTANT_MESSAGE_ID,
    })
  })

  test("does not mark proposed when the session is still busy", async () => {
    const childStores = new ChildStoreManager()
    const store = childStores.ensureChild(DIRECTORY)

    store.setState({
      ...INITIAL_STATE,
      session: [{ id: SESSION_ID, title: "Plan session", time: { created: 1, updated: 2 } } as Session],
      message: {
        [SESSION_ID]: [userMessage(), assistantMessage()],
      },
      part: {
        [USER_MESSAGE_ID]: [planModePart()],
        [ASSISTANT_MESSAGE_ID]: [textPart("")],
      },
      session_status: {
        [SESSION_ID]: { type: "busy" } as SessionStatus,
      },
    })

    useSessionUIStore.getState().recordUserMessagePlanMode(SESSION_ID, USER_MESSAGE_ID, true)

    const routingIndex = routingIndexFor()

    applySyncEventForTest(DIRECTORY, deltaEvent(structuredPlanBody), childStores, routingIndex)
    await flushAsync()

    expect(useSessionUIStore.getState().sessionPlanIndicator.has(SESSION_ID)).toBe(false)
  })

  test("records unread completion when a background normal turn completes via part update", async () => {
    const childStores = new ChildStoreManager()
    const store = childStores.ensureChild(DIRECTORY)
    const completedPart = textPart("Completed work.")

    store.setState({
      ...INITIAL_STATE,
      session: [{ id: SESSION_ID, title: "Task session", time: { created: 1, updated: 2 } } as Session],
      message: {
        [SESSION_ID]: [userMessage(), assistantMessage()],
      },
      part: {
        [USER_MESSAGE_ID]: [],
        [ASSISTANT_MESSAGE_ID]: [completedPart],
      },
      session_status: {
        [SESSION_ID]: { type: "idle" } as SessionStatus,
      },
    })

    applySyncEventForTest(DIRECTORY, partUpdatedEvent(completedPart), childStores, routingIndexFor())
    await flushAsync()

    const notificationState = useNotificationStore.getState()
    expect(notificationState.list).toHaveLength(1)
    expect(notificationState.list[0]?.type).toBe("turn-complete")
    expect(notificationState.list[0]?.directory).toBe(DIRECTORY)
    expect(notificationState.list[0]?.session).toBe(SESSION_ID)
    expect(notificationState.list[0]?.messageId).toBe(ASSISTANT_MESSAGE_ID)
    expect(notificationState.list[0]?.viewed).toBe(false)
    expect(notificationState.sessionHasCompletion(SESSION_ID)).toBe(true)
  })

  test("marks implemented plan completed and records unread completion from part update", async () => {
    const childStores = new ChildStoreManager()
    const store = childStores.ensureChild(DIRECTORY)
    const completedPart = implementTextPart("Implemented the plan.")
    const implementationKey = `${SESSION_ID}:${ASSISTANT_MESSAGE_ID}:plan:0`

    store.setState({
      ...INITIAL_STATE,
      session: [{ id: SESSION_ID, title: "Plan session", time: { created: 1, updated: 2 } } as Session],
      message: {
        [SESSION_ID]: [
          userMessage(),
          assistantMessage(),
          implementingUserMessage(),
          implementingAssistantMessage(),
        ],
      },
      part: {
        [USER_MESSAGE_ID]: [planModePart()],
        [ASSISTANT_MESSAGE_ID]: [textPart(`<!--plan-->\n${structuredPlanBody}`)],
        [IMPLEMENT_USER_MESSAGE_ID]: [],
        [IMPLEMENT_ASSISTANT_MESSAGE_ID]: [completedPart],
      },
      session_status: {
        [SESSION_ID]: { type: "idle" } as SessionStatus,
      },
    })

    useSessionUIStore.getState().recordUserMessagePlanMode(SESSION_ID, USER_MESSAGE_ID, true)
    useSessionUIStore.getState().markPlanProposed(SESSION_ID, ASSISTANT_MESSAGE_ID)
    useSessionUIStore.getState().markPlanImplementationRequested(implementationKey)
    useSessionUIStore.getState().markPlanImplementing(
      SESSION_ID,
      ASSISTANT_MESSAGE_ID,
      IMPLEMENT_USER_MESSAGE_ID,
    )

    applySyncEventForTest(
      DIRECTORY,
      partUpdatedEvent(completedPart),
      childStores,
      routingIndexFor([USER_MESSAGE_ID, ASSISTANT_MESSAGE_ID, IMPLEMENT_USER_MESSAGE_ID, IMPLEMENT_ASSISTANT_MESSAGE_ID]),
    )
    await flushAsync()

    expect(useSessionUIStore.getState().sessionPlanIndicator.get(SESSION_ID)).toEqual({
      state: "completed",
      sourceMessageId: ASSISTANT_MESSAGE_ID,
      implementationMessageId: IMPLEMENT_USER_MESSAGE_ID,
    })
    const notificationState = useNotificationStore.getState()
    expect(notificationState.list).toHaveLength(1)
    expect(notificationState.list[0]?.type).toBe("turn-complete")
    expect(notificationState.list[0]?.directory).toBe(DIRECTORY)
    expect(notificationState.list[0]?.session).toBe(SESSION_ID)
    expect(notificationState.list[0]?.messageId).toBe(IMPLEMENT_ASSISTANT_MESSAGE_ID)
    expect(notificationState.list[0]?.viewed).toBe(false)
  })

  test("does not record stale completion when part update finalizes a different message", async () => {
    const childStores = new ChildStoreManager()
    const store = childStores.ensureChild(DIRECTORY)
    const oldPart = textPart("Old completed work.")

    store.setState({
      ...INITIAL_STATE,
      session: [{ id: SESSION_ID, title: "Task session", time: { created: 1, updated: 2 } } as Session],
      message: {
        [SESSION_ID]: [
          userMessage(),
          assistantMessage(),
          implementingUserMessage(),
          implementingAssistantMessage(),
        ],
      },
      part: {
        [USER_MESSAGE_ID]: [],
        [ASSISTANT_MESSAGE_ID]: [oldPart],
        [IMPLEMENT_USER_MESSAGE_ID]: [],
        [IMPLEMENT_ASSISTANT_MESSAGE_ID]: [implementTextPart("Latest completed work.")],
      },
      session_status: {
        [SESSION_ID]: { type: "idle" } as SessionStatus,
      },
    })

    applySyncEventForTest(
      DIRECTORY,
      partUpdatedEvent(oldPart),
      childStores,
      routingIndexFor([USER_MESSAGE_ID, ASSISTANT_MESSAGE_ID, IMPLEMENT_USER_MESSAGE_ID, IMPLEMENT_ASSISTANT_MESSAGE_ID]),
    )
    await flushAsync()

    expect(useNotificationStore.getState().list).toHaveLength(0)
  })

  test("deduplicates repeated part update completion notifications for the same message", async () => {
    const childStores = new ChildStoreManager()
    const store = childStores.ensureChild(DIRECTORY)
    const completedPart = textPart("Completed work.")

    store.setState({
      ...INITIAL_STATE,
      session: [{ id: SESSION_ID, title: "Task session", time: { created: 1, updated: 2 } } as Session],
      message: {
        [SESSION_ID]: [userMessage(), assistantMessage()],
      },
      part: {
        [USER_MESSAGE_ID]: [],
        [ASSISTANT_MESSAGE_ID]: [completedPart],
      },
      session_status: {
        [SESSION_ID]: { type: "idle" } as SessionStatus,
      },
    })

    applySyncEventForTest(DIRECTORY, partUpdatedEvent(completedPart), childStores, routingIndexFor())
    await flushAsync()
    applySyncEventForTest(DIRECTORY, partUpdatedEvent(completedPart), childStores, routingIndexFor())
    await flushAsync()

    expect(useNotificationStore.getState().list).toHaveLength(1)
    expect(useNotificationStore.getState().sessionUnseenCount(SESSION_ID)).toBe(1)
  })
})
