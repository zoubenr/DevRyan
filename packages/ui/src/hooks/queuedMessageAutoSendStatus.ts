import type { SessionStatus } from "@opencode-ai/sdk/v2/client"

export type SessionStatusType = "idle" | "busy" | "retry" | "blocked" | "unknown"

export function resolveQueuedSessionStatusType(
  sessionId: string,
  liveStatuses: Record<string, SessionStatus | undefined>,
): SessionStatusType {
  const status = liveStatuses[sessionId]
  if (!status) return "unknown"
  const type = status.type
  return type === "busy" || type === "retry" ? type : "idle"
}

export function resolveQueuedAutoSendStatusType(
  sessionId: string,
  liveStatuses: Record<string, SessionStatus | undefined>,
  anyDirectoryStatus?: SessionStatus,
  blockingRequestCount = 0,
): SessionStatusType {
  if (blockingRequestCount > 0) {
    return "blocked"
  }
  const anyDirectoryType = anyDirectoryStatus?.type
  if (anyDirectoryType === "busy" || anyDirectoryType === "retry") {
    return anyDirectoryType
  }
  if (anyDirectoryStatus) {
    return "idle"
  }
  if (!Object.prototype.hasOwnProperty.call(liveStatuses, sessionId)) {
    return "unknown"
  }
  return resolveQueuedSessionStatusType(sessionId, liveStatuses)
}
