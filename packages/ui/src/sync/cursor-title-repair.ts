import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"
import { getSessionSummaryDiffTotals, type SessionSummaryDiffStats } from "@/lib/sessionDiffStats"
import { deriveSessionTitleFromUserText, isCursorAcpErrorTitle, isGeneratedNewSessionTitle } from "@/lib/sessionTitles"
import type { State } from "./types"

type RepairCandidate = {
  sessionId: string
  title: string
}

const CURSOR_PROVIDER_ID = "cursor-acp"
const PLAN_CARD_SENTINEL = "<!--plan-->"
const DEFAULT_SESSION_TITLE = "Untitled Session"
const MAX_TITLE_LENGTH = 80

const getPartText = (part: Part): string => {
  if (part?.type !== "text") return ""
  const synthetic = (part as { synthetic?: unknown }).synthetic === true
  if (synthetic) return ""
  const text = (part as { text?: unknown; content?: unknown; value?: unknown }).text
    ?? (part as { content?: unknown }).content
    ?? (part as { value?: unknown }).value
  return typeof text === "string" ? text : ""
}

const getLatestUserText = (messages: Message[], partsByMessage: State["part"]): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "user") continue
    const parts = partsByMessage[message.id] ?? []
    const text = parts.map(getPartText).join("").replace(/\s+/g, " ").trim()
    if (text) return text
  }
  return null
}

const normalizeTitleWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim()

const truncateTitle = (value: string): string => {
  const normalized = normalizeTitleWhitespace(value)
  return normalized.length <= MAX_TITLE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`
}

const cleanMarkdownHeadingText = (value: string): string => (
  value
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim()
)

const extractPlanHeadingTitle = (text: string): string | null => {
  if (!text.includes(PLAN_CARD_SENTINEL)) {
    return null
  }

  const planText = text.slice(text.indexOf(PLAN_CARD_SENTINEL) + PLAN_CARD_SENTINEL.length)
  for (const line of planText.split(/\r?\n/)) {
    const match = /^\s{0,3}#\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const title = cleanMarkdownHeadingText(match[1] ?? "")
    return title ? truncateTitle(title) : null
  }
  return null
}

const getLatestAssistantPlanTitle = (messages: Message[], partsByMessage: State["part"]): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "assistant") continue
    if ((message as { providerID?: unknown }).providerID !== CURSOR_PROVIDER_ID) continue
    const parts = partsByMessage[message.id] ?? []
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const title = extractPlanHeadingTitle(getPartText(parts[partIndex]))
      if (title) return title
    }
  }
  return null
}

const isRawPromptLikeTitle = (title: string | undefined | null, latestUserText: string | null): boolean => {
  const normalizedTitle = normalizeTitleWhitespace(title ?? "")
  const normalizedUserText = normalizeTitleWhitespace(latestUserText ?? "")
  if (!normalizedTitle || !normalizedUserText) return false
  if (normalizedTitle === normalizedUserText) return true
  if (!normalizedTitle.endsWith("...")) return false

  const prefix = normalizedTitle.slice(0, -3).trimEnd()
  return prefix.length > 0 && normalizedUserText.startsWith(prefix)
}

const hasCursorAcpMessages = (messages: Message[]): boolean => messages.some((message) => (
  (message as { providerID?: unknown }).providerID === CURSOR_PROVIDER_ID
))

const hasCompletedAssistantTurn = (messages: Message[]): boolean => messages.some((message) => {
  if (message?.role !== "assistant") return false
  const completed = (message.time as { completed?: unknown } | undefined)?.completed
  const finish = (message as { finish?: unknown }).finish
  return (typeof completed === "number" && Number.isFinite(completed) && completed > 0)
    || (typeof finish === "string" && finish.trim().length > 0)
})

const hasSummaryMutationEvidence = (summary: unknown): boolean => {
  const totals = getSessionSummaryDiffTotals(summary as SessionSummaryDiffStats | null | undefined)
  return totals.additions > 0 || totals.deletions > 0
}

const hasMutationEvidence = (session: Session, messages: Message[]): boolean => {
  if (hasSummaryMutationEvidence((session as Session & { summary?: unknown }).summary)) {
    return true
  }
  return messages.some((message) => hasSummaryMutationEvidence((message as Message & { summary?: unknown }).summary))
}

export const getCursorAcpTitleRepair = (state: State, sessionId: string): RepairCandidate | null => {
  if (!sessionId) return null
  const session = state.session.find((candidate) => candidate.id === sessionId)
  if (!session) {
    return null
  }

  const messages = state.message[sessionId] ?? []
  if (!hasCursorAcpMessages(messages)) {
    return null
  }
  const latestUserText = getLatestUserText(messages, state.part)
  const currentTitle = normalizeTitleWhitespace(session.title ?? "")
  const shouldRepairTitle = isCursorAcpErrorTitle(currentTitle)
    || isGeneratedNewSessionTitle(currentTitle)
    || currentTitle === DEFAULT_SESSION_TITLE
    || isRawPromptLikeTitle(currentTitle, latestUserText)
  if (!shouldRepairTitle) {
    return null
  }

  if (!hasCompletedAssistantTurn(messages) && !hasMutationEvidence(session, messages)) {
    return null
  }

  const title = getLatestAssistantPlanTitle(messages, state.part)
    ?? deriveSessionTitleFromUserText(latestUserText)
  if (!title || title === session.title) {
    return null
  }
  return { sessionId, title }
}
