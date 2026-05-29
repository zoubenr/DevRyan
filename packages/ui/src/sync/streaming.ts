/**
 * Streaming lifecycle tracking.
 *
 * Derives streaming state from the sync child store's session_status and
 * message/part updates. Components read this to know which messages are
 * currently streaming and their lifecycle phase.
 */

import { create } from "zustand"
import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"
import type { State } from "./types"

export type StreamPhase = "streaming" | "cooldown" | "completed"

export type MessageStreamState = {
  phase: StreamPhase
  startedAt: number
  lastUpdateAt: number
  completedAt?: number
}

export type StreamingStore = {
  /** Currently streaming message per session */
  streamingMessageIds: Map<string, string | null>
  /** Lifecycle phase per message */
  messageStreamStates: Map<string, MessageStreamState>
}

export const useStreamingStore = create<StreamingStore>()(() => ({
  streamingMessageIds: new Map(),
  messageStreamStates: new Map(),
}))

/**
 * Called from the SyncBridge/flush handler when child store state changes.
 * Derives streaming state from session_status + messages.
 */
/** Only update lastUpdateAt every this many ms to avoid 60Hz store churn */
const STREAMING_HEARTBEAT_MS = 1000

const isTerminalAssistantMessage = (message: Message | undefined): boolean => {
  if (!message || message.role !== "assistant") return false
  const finish = (message as { finish?: unknown }).finish
  const completed = (message as { time?: { completed?: unknown } }).time?.completed
  return typeof completed === "number" || (typeof finish === "string" && finish.length > 0)
}

const hasTerminalAssistantFinish = (message: Message | undefined): boolean => {
  if (!message || message.role !== "assistant") return false
  const finish = (message as { finish?: unknown }).finish
  return typeof finish === "string" && finish.length > 0
}

const isIncompleteAssistantMessage = (message: Message | undefined): message is Message => (
  Boolean(message && message.role === "assistant" && !isTerminalAssistantMessage(message))
)

export function updateStreamingState(state: State) {
  const now = Date.now()
  const currentStore = useStreamingStore.getState()
  const currentStreamingIds = currentStore.streamingMessageIds
  const currentStreamStates = currentStore.messageStreamStates

  const nextStreamingIds = new Map<string, string | null>()
  const nextStreamStates = new Map(currentStreamStates)
  let changed = false

  // Fast path: only scan sessions that are actually busy.
  // Idle sessions are handled by checking against currentStreamingIds below.
  const busySessionIds = new Set<string>()
  for (const [sessionID, status] of Object.entries(state.session_status ?? {})) {
    if ((status as SessionStatus).type === "busy") {
      busySessionIds.add(sessionID)
    }
  }

  // Narrow recovery for delayed/missing busy status: if a session has no
  // authoritative idle/error status yet and its trailing message is an
  // incomplete assistant response, keep it in the streaming set so the chat can
  // render/follow the latest live content. Do not scan historical messages.
  for (const [sessionID, messages] of Object.entries(state.message)) {
    if (busySessionIds.has(sessionID)) continue
    const status = state.session_status?.[sessionID]
    const trailing = messages[messages.length - 1]

    if (status && status.type !== "busy") {
      const currentStreamingId = currentStreamingIds.get(sessionID)
      if (currentStreamingId && trailing?.id === currentStreamingId && isIncompleteAssistantMessage(trailing)) {
        busySessionIds.add(sessionID)
      }
      continue
    }

    if (isIncompleteAssistantMessage(trailing)) {
      busySessionIds.add(sessionID)
    }
  }

  const completeStreamingMessage = (sessionID: string, msgId: string) => {
    nextStreamingIds.set(sessionID, null)
    const existing = nextStreamStates.get(msgId)
    if (existing && existing.phase === "streaming") {
      nextStreamStates.set(msgId, {
        ...existing,
        phase: "completed",
        completedAt: now,
      })
    }
    changed = true
  }

  for (const sessionID of busySessionIds) {
    const messages = state.message[sessionID]
    if (!messages || messages.length === 0) continue

    // Only the trailing assistant turn can be streaming. If a new user turn is
    // last, the next assistant message has not arrived yet.
    let streamingMsg: Message | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        break
      }
      if (messages[i].role === "assistant") {
        streamingMsg = messages[i]
        break
      }
    }

    if (!streamingMsg || hasTerminalAssistantFinish(streamingMsg)) {
      const prevId = currentStreamingIds.get(sessionID)
      if (prevId) {
        completeStreamingMessage(sessionID, prevId)
      }
      continue
    }

    const prevId = currentStreamingIds.get(sessionID)
    if (prevId !== streamingMsg.id) changed = true
    nextStreamingIds.set(sessionID, streamingMsg.id)

    const existing = nextStreamStates.get(streamingMsg.id)
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMsg.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
      })
      changed = true
    } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
      // Throttle lastUpdateAt writes to ~1Hz instead of 60Hz
      nextStreamStates.set(streamingMsg.id, {
        ...existing,
        lastUpdateAt: now,
      })
      changed = true
    }
  }

  // Mark completed any previously streaming sessions that are now idle or gone
  for (const [sessionID, msgId] of currentStreamingIds) {
    if (!msgId) continue
    const isStillBusy = busySessionIds.has(sessionID)
    if (isStillBusy) continue

    completeStreamingMessage(sessionID, msgId)
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
    })
  }
}

// Selectors
export const selectStreamingMessageId = (sessionID: string) =>
  (state: StreamingStore) => state.streamingMessageIds.get(sessionID) ?? null

export const selectMessageStreamState = (messageID: string) =>
  (state: StreamingStore) => state.messageStreamStates.get(messageID) ?? null

export const selectIsStreaming = (sessionID: string) =>
  (state: StreamingStore) => state.streamingMessageIds.get(sessionID) != null
