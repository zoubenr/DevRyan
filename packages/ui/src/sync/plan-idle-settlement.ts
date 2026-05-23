import type { Message, Part } from "@opencode-ai/sdk/v2/client"

import { getPlanBlockId, getPlanImplementationKey } from "@/lib/messages/actionablePlan"
import type { PlanIndicatorEntry } from "./plan-indicator"
import { filterMessagesForRevert, getEffectiveSessionRevertMessageID } from "./revert-transactions"
import type { State } from "./types"

type PlanIdleSettlementState = Pick<
  State,
  "message" | "part" | "permission" | "question" | "session" | "session_status" | "revert_transaction"
>

type PlanIdleSettlementInput = {
  sessionID: string
  state: PlanIdleSettlementState
  sourceMessageId: string
  planEntry?: PlanIndicatorEntry | null
  implementedPlanRequests: ReadonlySet<string>
}

export function shouldSettlePlanProposalStatus({
  sessionID,
  state,
  sourceMessageId,
  planEntry,
  implementedPlanRequests,
}: PlanIdleSettlementInput): boolean {
  if (state.session_status[sessionID]?.type !== "busy") return false
  if (planEntry?.state !== "proposed" || planEntry.sourceMessageId !== sourceMessageId) return false

  const implementationKey = getPlanImplementationKey(sessionID, getPlanBlockId(sourceMessageId, 0))
  if (implementedPlanRequests.has(implementationKey)) return false

  if ((state.permission[sessionID]?.length ?? 0) > 0) return false
  if ((state.question[sessionID]?.length ?? 0) > 0) return false

  const rawMessages = state.message[sessionID]
  if (!rawMessages || rawMessages.length === 0) return false

  const revertMessageID = getEffectiveSessionRevertMessageID(state, sessionID)
  const messages = filterMessagesForRevert(rawMessages, revertMessageID)
  const trailingMessage = messages[messages.length - 1]

  if (!trailingMessage || trailingMessage.id !== sourceMessageId || trailingMessage.role !== "assistant") {
    return false
  }

  if (!isAssistantTurnComplete(trailingMessage)) return false
  if (hasRunningToolPart(state.part[sourceMessageId] ?? [])) return false

  return true
}

function hasRunningToolPart(parts: readonly Part[]): boolean {
  for (const part of parts) {
    if (part.type !== "tool") continue
    const status = (part as Part & { state?: { status?: unknown } }).state?.status
    if (status === "pending" || status === "running") return true
  }

  return false
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
