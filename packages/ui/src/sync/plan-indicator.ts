export type PlanIndicatorState = "proposed" | "implementing" | "completed"

export type PlanIndicatorEntry = {
  state: PlanIndicatorState
  sourceMessageId?: string
  implementationMessageId?: string
}

export type PlanIndicatorTone = "warning" | "success"

export const getPlanIndicatorTone = (state: PlanIndicatorState): PlanIndicatorTone => {
  return state === "completed" ? "success" : "warning"
}

const PLAN_INDICATOR_RANK: Record<PlanIndicatorState, number> = {
  proposed: 0,
  implementing: 1,
  completed: 2,
}

const compareSourceMessageIds = (left?: string, right?: string): number => {
  if (!left || !right || left === right) return 0
  // Message ids are generated as sortable ids in the sync layer; use lexical
  // ordering only to prevent older rendered plan blocks from clobbering newer
  // plan lifecycle state.
  return left < right ? -1 : 1
}

const createPlanIndicatorEntry = (
  state: PlanIndicatorState,
  sourceMessageId?: string,
  implementationMessageId?: string,
): PlanIndicatorEntry => ({
  state,
  sourceMessageId,
  ...(implementationMessageId ? { implementationMessageId } : {}),
})

export const nextPlanIndicatorEntry = (
  current: PlanIndicatorEntry | undefined,
  nextState: PlanIndicatorState,
  sourceMessageId?: string,
  implementationMessageId?: string,
): PlanIndicatorEntry | undefined => {
  if (!current) return createPlanIndicatorEntry(nextState, sourceMessageId, implementationMessageId)

  const sourceOrder = compareSourceMessageIds(sourceMessageId, current.sourceMessageId)
  if (sourceOrder < 0) return current

  if (sourceOrder > 0) return createPlanIndicatorEntry(nextState, sourceMessageId, implementationMessageId)

  const currentRank = PLAN_INDICATOR_RANK[current.state]
  const nextRank = PLAN_INDICATOR_RANK[nextState]
  if (nextRank < currentRank) return current

  const nextImplementationMessageId = implementationMessageId ?? current.implementationMessageId
  if (
    current.state === nextState
    && current.sourceMessageId === sourceMessageId
    && current.implementationMessageId === nextImplementationMessageId
  ) {
    return current
  }

  return createPlanIndicatorEntry(
    nextState,
    sourceMessageId ?? current.sourceMessageId,
    nextImplementationMessageId,
  )
}
