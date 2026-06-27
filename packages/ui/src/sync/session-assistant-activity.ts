import type { Message, Session } from "@opencode-ai/sdk/v2/client"
import { isMessageVisibleForSession, toFiniteTimestamp } from "./session-user-activity"

export type SessionAssistantActivity = Record<string, number>

export const getAssistantResponseAt = (message: Message): number | undefined => {
  const time = message.time as { completed?: unknown; updated?: unknown; created?: unknown } | undefined
  const completedAt = toFiniteTimestamp(time?.completed)
  if (completedAt !== undefined) return completedAt

  const updatedAt = toFiniteTimestamp(time?.updated)
  if (updatedAt !== undefined) return updatedAt

  return toFiniteTimestamp(time?.created)
}

export const getLastVisibleAssistantResponseAt = (
  session: Session | undefined,
  messages: readonly Message[] | undefined,
): number | undefined => {
  if (!messages) return undefined

  let latest: number | undefined
  for (const message of messages) {
    if (message.role !== "assistant" || !isMessageVisibleForSession(message, session)) continue
    const responseAt = getAssistantResponseAt(message)
    if (responseAt === undefined) continue
    latest = latest === undefined ? responseAt : Math.max(latest, responseAt)
  }
  return latest
}
