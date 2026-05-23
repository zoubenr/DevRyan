export function resolveUserMessageRevertSessionId(
  messageSessionId: string | null | undefined,
  visibleSessionId: string | null | undefined,
): string | null {
  const messageSession = messageSessionId?.trim()
  if (messageSession) return messageSession

  const visibleSession = visibleSessionId?.trim()
  return visibleSession || null
}
