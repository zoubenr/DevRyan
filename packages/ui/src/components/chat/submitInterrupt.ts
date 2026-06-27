export type SubmitInterruptOptions = {
  currentSessionId?: string | null
  sessionPhase: "idle" | string
  queuedMessageCount: number
  queuedOnly: boolean
}

export function isAbortableSessionPhase(sessionPhase: "idle" | string): boolean {
  return sessionPhase !== "idle" && sessionPhase !== "question"
}

export function shouldInterruptBeforeSubmit(options: SubmitInterruptOptions): boolean {
  if (!options.currentSessionId || !isAbortableSessionPhase(options.sessionPhase)) {
    return false
  }

  if (options.queuedOnly) {
    return options.queuedMessageCount > 0
  }

  return true
}
