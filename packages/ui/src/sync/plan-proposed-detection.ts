import type { Message } from "@opencode-ai/sdk/v2/client"
import { getPlanBlockId, getPlanImplementationKey, isPlanModeUserMessage, resolveMessagePlanCard } from "@/lib/messages/actionablePlan"
import { filterMessagesForRevert, getEffectiveSessionRevertMessageID } from "./revert-transactions"
import type { State } from "./types"

export type PlanProposedCandidate = {
  sessionID: string
  sourceMessageId: string
  originatingUserMessageId: string
  implementationKey: string
}

type PlanProposedDetectionState = Pick<
  State,
  "message" | "part" | "question" | "session" | "revert_transaction"
>

export function detectPlanProposedCandidate({
  sessionID,
  state,
  isRecordedPlanModeUserMessage,
  implementedPlanRequests,
}: {
  sessionID: string
  state: PlanProposedDetectionState
  isRecordedPlanModeUserMessage: (messageId: string) => boolean
  implementedPlanRequests: ReadonlySet<string>
}): PlanProposedCandidate | null {
  const pendingQuestions = state.question[sessionID]
  if (pendingQuestions && pendingQuestions.length > 0) return null

  const rawMessages = state.message[sessionID]
  if (!rawMessages || rawMessages.length === 0) return null

  const revertMessageID = getEffectiveSessionRevertMessageID(state, sessionID)
  const messages = filterMessagesForRevert(rawMessages, revertMessageID)

  for (let assistantIndex = messages.length - 1; assistantIndex >= 0; assistantIndex -= 1) {
    const assistantMessage = messages[assistantIndex]
    if (assistantMessage.role !== "assistant") continue
    if (!isAssistantTurnComplete(assistantMessage)) continue

    const userMessage = findOriginatingUserMessage(messages, assistantIndex)
    if (!userMessage) continue

    const userParts = state.part[userMessage.id] ?? []
    const recordedPlanMode = isRecordedPlanModeUserMessage(userMessage.id)
    if (!isPlanModeUserMessage(userMessage, userParts, recordedPlanMode)) continue
    if (!hasPresentedPlanCard(state, assistantMessage.id)) continue

    const implementationKey = getPlanImplementationKey(
      sessionID,
      getPlanBlockId(assistantMessage.id, 0),
    )
    if (implementedPlanRequests.has(implementationKey)) continue

    return {
      sessionID,
      sourceMessageId: assistantMessage.id,
      originatingUserMessageId: userMessage.id,
      implementationKey,
    }
  }

  return null
}

function hasPresentedPlanCard(state: PlanProposedDetectionState, assistantMessageId: string): boolean {
  const parts = state.part[assistantMessageId] ?? []
  const split = resolveMessagePlanCard(parts, { isPlanModeSource: true })
  return Boolean(split && split.planText.trim().length > 0)
}

function findOriginatingUserMessage(messages: readonly Message[], assistantIndex: number): Message | null {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "user") return message
  }
  return null
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
