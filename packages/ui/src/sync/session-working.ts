import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"

export function hasTerminalAssistantFinish(message: Message | undefined): boolean {
  if (!message || message.role !== "assistant") return false
  const finish = (message as { finish?: unknown }).finish
  if (typeof finish !== "string") return false
  const normalized = finish.trim().toLowerCase()
  return normalized.length > 0 && normalized !== "tool-calls"
}

export function isTerminalAssistantMessage(message: Message | undefined): boolean {
  if (!message || message.role !== "assistant") return false
  const completed = (message as { time?: { completed?: unknown } }).time?.completed
  return typeof completed === "number" || hasTerminalAssistantFinish(message)
}

function isIncompleteAssistantMessage(message: Message | undefined): boolean {
  return Boolean(
    message
    && message.role === "assistant"
    && !isTerminalAssistantMessage(message),
  )
}

export function isSessionWorkingFromState({
  status,
  permissions,
  messages,
  liveStreamingMessageId,
}: {
  status: SessionStatus | undefined
  permissions: readonly unknown[]
  messages: readonly Message[]
  liveStreamingMessageId?: string | null
}): boolean {
  // Permissions pending → not "working" (show permission indicator instead)
  if (permissions.length > 0) return false

  const hasAuthoritativeStatus = status !== undefined
  const statusWorking = hasAuthoritativeStatus && status.type !== "idle"
  const lastMessage = messages[messages.length - 1]
  const trailingLiveStreaming = Boolean(
    isIncompleteAssistantMessage(lastMessage)
    && lastMessage.id === liveStreamingMessageId
  )
  // Trust authoritative idle status over stale incomplete assistant messages.
  // A currently tracked streaming id is the narrow exception for out-of-order
  // idle status events during the live turn.
  if (hasAuthoritativeStatus) {
    return statusWorking || trailingLiveStreaming
  }

  return isIncompleteAssistantMessage(lastMessage)
}
