import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"

export function isSessionWorkingFromState({
  status,
  permissions,
  messages,
}: {
  status: SessionStatus | undefined
  permissions: readonly unknown[]
  messages: readonly Message[]
}): boolean {
  // Permissions pending → not "working" (show permission indicator instead)
  if (permissions.length > 0) return false

  const hasAuthoritativeStatus = status !== undefined
  const statusWorking = hasAuthoritativeStatus && status.type !== "idle"

  // Trust authoritative idle status over stale incomplete assistant messages.
  // The message check is only a transient fallback while status has not arrived.
  if (hasAuthoritativeStatus) return statusWorking

  const lastMessage = messages[messages.length - 1]
  return Boolean(
    lastMessage
    && lastMessage.role === "assistant"
    && typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== "number",
  )
}
