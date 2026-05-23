import type { Event, SessionStatus } from "@opencode-ai/sdk/v2/client"
import type { Session } from "@opencode-ai/sdk/v2"
import type { State } from "./types"

function getSessionIdFromTerminalPayload(event: Event): string | null {
  const properties = event.properties as { sessionID?: string } | undefined
  return properties?.sessionID || null
}

export function getTerminalSessionIdForParentMaterialization(event: Event): string | null {
  if (event.type === "session.idle" || event.type === "session.error") {
    return getSessionIdFromTerminalPayload(event)
  }

  if (event.type !== "session.status") {
    return null
  }

  const properties = event.properties as { sessionID?: string; status?: SessionStatus } | undefined
  if (properties?.status?.type !== "idle") {
    return null
  }

  return properties.sessionID || null
}

export function resolveParentSessionIdForTerminalChild(state: State, childSessionID: string): string | null {
  const childSession = state.session.find((session) => session.id === childSessionID)
  // Decision: only use the authoritative in-memory child->parent link; guessing
  // from historical messages would risk resyncing the wrong parent after aborts.
  return childSession
    ? ((childSession as Session & { parentID?: string | null }).parentID ?? null)
    : null
}
