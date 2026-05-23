export const STARTUP_READINESS_PHASES = [
  "health",
  "providers",
  "agents",
  "globalSync",
  "directorySync",
  "sessionList",
  "responseStyle",
  "worktree",
  "agentRuntime",
  "chatRuntime",
] as const

export type StartupReadinessPhase = typeof STARTUP_READINESS_PHASES[number]
export type StartupPhaseStatus = "idle" | "loading" | "ready" | "error"
export type StartupRoute = "main" | "desktop-chooser" | "desktop-recovery"

export interface StartupPhaseSnapshot {
  status: StartupPhaseStatus
  error?: string | null
}

export type StartupReadinessSnapshot = Record<StartupReadinessPhase, StartupPhaseSnapshot>

export interface StartupReadinessOptions {
  route?: StartupRoute
}

export interface StartupReadinessSummary {
  ready: boolean
  phase?: StartupReadinessPhase
  status?: StartupPhaseStatus
  error?: string
}

const clonePhase = (phase: StartupPhaseSnapshot): StartupPhaseSnapshot => ({
  status: phase.status,
  error: phase.error ?? null,
})

export const createStartupReadinessSnapshot = (
  status: StartupPhaseStatus = "idle",
): StartupReadinessSnapshot => STARTUP_READINESS_PHASES.reduce((snapshot, phase) => {
  snapshot[phase] = { status, error: null }
  return snapshot
}, {} as StartupReadinessSnapshot)

export const withStartupReadinessPhase = (
  snapshot: StartupReadinessSnapshot,
  phase: StartupReadinessPhase,
  next: StartupPhaseSnapshot,
): StartupReadinessSnapshot => ({
  ...snapshot,
  [phase]: clonePhase(next),
})

export const summarizeStartupReadiness = (
  snapshot: StartupReadinessSnapshot,
  options?: StartupReadinessOptions,
): StartupReadinessSummary => {
  if (options?.route === "desktop-chooser" || options?.route === "desktop-recovery") {
    return { ready: true }
  }

  for (const phase of STARTUP_READINESS_PHASES) {
    const item = snapshot[phase]
    if (item.status === "error") {
      return {
        ready: false,
        phase,
        status: item.status,
        error: item.error || "Startup failed.",
      }
    }
    if (item.status !== "ready") {
      return { ready: false, phase, status: item.status }
    }
  }

  return { ready: true }
}

export const shouldShowStartupReadinessScreen = (
  summary: StartupReadinessSummary,
  hasCompletedStartup: boolean,
): boolean => !hasCompletedStartup && !summary.ready
