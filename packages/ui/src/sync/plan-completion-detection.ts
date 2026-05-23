import type { Message } from "@opencode-ai/sdk/v2/client"
import type { PlanIndicatorEntry } from "./plan-indicator"
import { getPlanBlockId, getPlanImplementationKey, isPlanModeUserMessage, splitPlanCardSentinel } from "@/lib/messages/actionablePlan"
import { filterMessagesForRevert, getEffectiveSessionRevertMessageID } from "./revert-transactions"
import type { State } from "./types"

export type PlanCompletedCandidate = {
  sessionID: string
  sourceMessageId: string
  implementationMessageId: string
  completedMessageId: string
}

type PlanCompletionDetectionState = Pick<
  State,
  "message" | "part" | "session" | "revert_transaction"
>

export function detectPlanCompletedCandidate({
  sessionID,
  state,
  planEntry,
  isRecordedPlanModeUserMessage,
  implementedPlanRequests,
}: {
  sessionID: string
  state: PlanCompletionDetectionState
  planEntry?: PlanIndicatorEntry | null
  isRecordedPlanModeUserMessage?: (messageId: string) => boolean
  implementedPlanRequests?: ReadonlySet<string>
}): PlanCompletedCandidate | null {
  const rawMessages = state.message[sessionID]
  if (!rawMessages || rawMessages.length === 0) return null

  const revertMessageID = getEffectiveSessionRevertMessageID(state, sessionID)
  const messages = filterMessagesForRevert(rawMessages, revertMessageID)

  if (planEntry?.state === "implementing" && planEntry.sourceMessageId && planEntry.implementationMessageId) {
    const implementationIndex = messages.findIndex((message) => (
      message.id === planEntry.implementationMessageId && message.role === "user"
    ))
    if (implementationIndex < 0) return null

    const completedMessage = findCompletedAssistantAfter(messages, implementationIndex)
    if (!completedMessage) return null

    return {
      sessionID,
      sourceMessageId: planEntry.sourceMessageId,
      implementationMessageId: planEntry.implementationMessageId,
      completedMessageId: completedMessage.id,
    }
  }

  if (!implementedPlanRequests || implementedPlanRequests.size === 0) return null

  return detectPersistedPlanCompletedCandidate({
    sessionID,
    state,
    messages,
    planEntry,
    isRecordedPlanModeUserMessage,
    implementedPlanRequests,
  })
}

function detectPersistedPlanCompletedCandidate({
  sessionID,
  state,
  messages,
  planEntry,
  isRecordedPlanModeUserMessage,
  implementedPlanRequests,
}: {
  sessionID: string
  state: PlanCompletionDetectionState
  messages: readonly Message[]
  planEntry?: PlanIndicatorEntry | null
  isRecordedPlanModeUserMessage?: (messageId: string) => boolean
  implementedPlanRequests: ReadonlySet<string>
}): PlanCompletedCandidate | null {
  for (let assistantIndex = messages.length - 1; assistantIndex >= 0; assistantIndex -= 1) {
    const assistantMessage = messages[assistantIndex]
    if (assistantMessage.role !== "assistant") continue
    if (!isAssistantTurnComplete(assistantMessage)) continue
    if (!hasPresentedPlanCard(state, assistantMessage.id)) continue

    const userMessage = findOriginatingUserMessage(messages, assistantIndex)
    if (!userMessage) continue
    const recordedPlanMode = isRecordedPlanModeUserMessage?.(userMessage.id) ?? false
    if (!isPlanModeUserMessage(userMessage, state.part[userMessage.id] ?? [], recordedPlanMode)) continue

    const implementationKey = getPlanImplementationKey(sessionID, getPlanBlockId(assistantMessage.id, 0))
    if (!implementedPlanRequests.has(implementationKey)) continue

    const implementationIndex = findImplementationUserIndex(messages, assistantIndex, planEntry, assistantMessage.id)
    if (implementationIndex < 0) return null

    const completedMessage = findCompletedAssistantAfter(messages, implementationIndex)
    if (!completedMessage) return null

    return {
      sessionID,
      sourceMessageId: assistantMessage.id,
      implementationMessageId: messages[implementationIndex].id,
      completedMessageId: completedMessage.id,
    }
  }

  return null
}

function findCompletedAssistantAfter(messages: readonly Message[], startIndex: number): Message | null {
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (message.role !== "assistant") continue
    if (!isAssistantTurnComplete(message)) continue
    return message
  }

  return null
}

function findOriginatingUserMessage(messages: readonly Message[], assistantIndex: number): Message | null {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "user") return message
  }
  return null
}

function findImplementationUserIndex(
  messages: readonly Message[],
  assistantIndex: number,
  planEntry: PlanIndicatorEntry | null | undefined,
  sourceMessageId: string,
): number {
  if (planEntry?.sourceMessageId === sourceMessageId && planEntry.implementationMessageId) {
    const knownIndex = messages.findIndex((message) => (
      message.id === planEntry.implementationMessageId && message.role === "user"
    ))
    if (knownIndex > assistantIndex) return knownIndex
  }

  for (let index = assistantIndex + 1; index < messages.length; index += 1) {
    if (messages[index].role === "user") return index
  }

  return -1
}

function hasPresentedPlanCard(state: PlanCompletionDetectionState, assistantMessageId: string): boolean {
  const parts = state.part[assistantMessageId] ?? []
  const textParts: string[] = []
  for (const part of parts) {
    if (part.type !== "text") continue

    const candidate = part as { text?: unknown; content?: unknown; value?: unknown }
    const text = typeof candidate.text === "string"
      ? candidate.text
      : typeof candidate.content === "string"
        ? candidate.content
        : typeof candidate.value === "string"
          ? candidate.value
          : ""
    if (text.trim().length > 0) textParts.push(text.trim())
  }

  if (textParts.length === 0) return false
  const split = splitPlanCardSentinel(textParts.join("\n"))
  return Boolean(split && split.planText.trim().length > 0)
}

function isAssistantTurnComplete(message: Message): boolean {
  const candidate = message as Message & { status?: unknown; streaming?: unknown }
  if (candidate.streaming === true) return false

  if (typeof candidate.status === "string") {
    const status = candidate.status.trim().toLowerCase()
    if (status === "running" || status === "pending" || status === "streaming") return false
    if (status === "complete" || status === "completed" || status === "done") return true
  }

  const completedAt = (message.time as { completed?: unknown } | undefined)?.completed
  return typeof completedAt === "number" && completedAt > 0
}
