export type SubmitInterruptOptions = {
  currentSessionId?: string | null
  sessionPhase: "idle" | string
  queuedMessageCount: number
  queuedOnly: boolean
}

export function shouldInterruptBeforeSubmit(options: SubmitInterruptOptions): boolean {
  if (!options.currentSessionId || options.sessionPhase === "idle") {
    return false
  }

  if (options.queuedOnly) {
    return options.queuedMessageCount > 0
  }

  return true
}
