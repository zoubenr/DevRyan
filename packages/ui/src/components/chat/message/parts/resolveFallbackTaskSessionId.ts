/**
 * resolveFallbackTaskSessionId — pure helper that resolves a pending task tool
 * to a child session from the directory session store when explicit taskSessionId
 * metadata is delayed.
 *
 * Conservative: only returns a session id when the match is unambiguous.
 */

import type { Session, SessionStatus } from '@opencode-ai/sdk/v2/client';

/**
 * Fallback is intentionally narrow: only sessions created shortly after the
 * task started are eligible. This avoids binding to earlier or later sibling
 * subagent sessions when explicit task metadata is delayed.
 */
/**
 * Narrow initial window avoids binding to wrong sessions on first attempt.
 * Wide window on retry handles late-appearing child sessions under load.
 */
const TASK_SESSION_MATCH_WINDOW_MS = 3000;
const TASK_SESSION_MATCH_WINDOW_WIDE_MS = 8000;

const LIVE_STATUSES = new Set<string>(['busy', 'retry']);

export interface ResolveTaskSessionFromChildrenParams {
  explicitSessionId?: string;
  parentSessionId: string | undefined;
  childSessions: Session[];
  subagentType?: string;
  taskStartTime?: number;
  taskEndTime?: number;
}

const normalizeSessionIdCandidate = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeAgentName = (value: unknown): string => {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

const getSessionAgent = (session: Session): string => {
  return normalizeAgentName((session as Session & { agent?: unknown }).agent);
};

const getSessionCreatedAt = (session: Session): number | undefined => {
  const created = session.time?.created;
  return typeof created === 'number' && Number.isFinite(created) ? created : undefined;
};

const isWithinTaskWindow = (
  session: Session,
  taskStartTime: number | undefined,
  taskEndTime: number | undefined,
): boolean => {
  const created = getSessionCreatedAt(session);
  if (typeof created !== 'number') {
    return false;
  }
  if (typeof taskStartTime === 'number' && created < taskStartTime) {
    return false;
  }
  if (typeof taskEndTime === 'number' && created > taskEndTime) {
    return false;
  }
  return true;
};

const resolveSingleByTime = (
  sessions: Session[],
  taskStartTime: number | undefined,
  taskEndTime: number | undefined,
): string | undefined => {
  if (typeof taskStartTime !== 'number' && typeof taskEndTime !== 'number') {
    return undefined;
  }
  const matched = sessions.filter((session) => isWithinTaskWindow(session, taskStartTime, taskEndTime));
  return matched.length === 1 ? matched[0].id : undefined;
};

// Returns the chosen child only when the time window allows it. When the task
// has no start/end time yet (very first render before the part has a start),
// the single-match shortcut is preserved: there is nothing better to do, and
// the assignment context will correct on a later render. When a start/end is
// known, a single match that falls outside the window must be rejected so the
// previous same-agent sibling can't be reused as a stale binding.
const pickSingleWithinWindow = (
  matches: Session[],
  taskStartTime: number | undefined,
  taskEndTime: number | undefined,
): string | undefined => {
  if (matches.length === 0) {
    return undefined;
  }
  const hasWindow = typeof taskStartTime === 'number' || typeof taskEndTime === 'number';
  if (!hasWindow) {
    return matches.length === 1 ? matches[0].id : undefined;
  }
  return resolveSingleByTime(matches, taskStartTime, taskEndTime);
};

export function resolveTaskSessionIdFromChildren(params: ResolveTaskSessionFromChildrenParams): string | undefined {
  const explicitSessionId = normalizeSessionIdCandidate(params.explicitSessionId);
  if (explicitSessionId) {
    return explicitSessionId;
  }

  const parentSessionId = normalizeSessionIdCandidate(params.parentSessionId);
  if (!parentSessionId) {
    return undefined;
  }

  const candidates = params.childSessions.filter((session) => {
    return Boolean(session?.id) && session.parentID === parentSessionId;
  });
  const subagentType = normalizeAgentName(params.subagentType);
  if (subagentType) {
    const agentMatches = candidates.filter((session) => getSessionAgent(session) === subagentType);
    return pickSingleWithinWindow(agentMatches, params.taskStartTime, params.taskEndTime);
  }

  return pickSingleWithinWindow(candidates, params.taskStartTime, params.taskEndTime);
}

export interface ResolveFallbackParams {
  /** True when this tool is a task tool */
  isTaskTool: boolean;
  /** The parent session id (current session) */
  parentSessionId: string | undefined;
  /** When the task tool started (ms timestamp) */
  taskStartTime: number | undefined;
  /** True when the task tool is finalized (completed/error/etc.) */
  isTaskFinalized?: boolean;
  /** Sessions from the directory store */
  sessions: Session[];
  /** Session status map from the sync store */
  sessionStatusMap?: Record<string, SessionStatus>;
  /** True when a previous resolution attempt has already failed (enables wider window) */
  hasRetried?: boolean;
  /** Allows finalized task tools to recover a delayed or missing child session id */
  allowFinalizedRecovery?: boolean;
  /** Requested subagent type from task input, used to disambiguate sibling children */
  subagentType?: string;
}

/**
 * Attempts to resolve a child session id for a pending task tool by matching
 * against sessions in the directory store.
 *
 * Returns `undefined` when:
 * - Not a task tool
 * - Task is finalized and finalized recovery is not explicitly enabled
 * - Parent session is unknown
 * - No unambiguous match found
 */
export function resolveFallbackTaskSessionId(params: ResolveFallbackParams): string | undefined {
  const {
    isTaskTool,
    parentSessionId,
    taskStartTime,
    isTaskFinalized = false,
    sessions,
    sessionStatusMap,
    hasRetried = false,
    allowFinalizedRecovery = false,
    subagentType,
  } = params;

  if (!isTaskTool || (isTaskFinalized && !allowFinalizedRecovery) || !parentSessionId || typeof taskStartTime !== 'number') {
    return undefined;
  }

  const windowMs = hasRetried ? TASK_SESSION_MATCH_WINDOW_WIDE_MS : TASK_SESSION_MATCH_WINDOW_MS;
  const latestAllowed = taskStartTime + windowMs;

  // Filter candidate sessions: parentID matches and created shortly after task start.
  const candidates = sessions.filter((session) => {
    if (!session?.id || session.parentID !== parentSessionId) {
      return false;
    }
    const created = session.time?.created;
    if (typeof created !== 'number') {
      return false;
    }
    return created >= taskStartTime && created <= latestAllowed;
  });

  let scopedCandidates = candidates;
  const normalizedSubagentType = normalizeAgentName(subagentType);
  if (normalizedSubagentType) {
    scopedCandidates = candidates.filter((session) => {
      return getSessionAgent(session) === normalizedSubagentType;
    });
  }

  if (scopedCandidates.length === 0) {
    return undefined;
  }

  // If exactly one candidate, return it regardless of status
  if (scopedCandidates.length === 1) {
    return scopedCandidates[0].id;
  }

  // Multiple candidates: try to disambiguate by finding exactly one live (busy/retry)
  const liveCandidates = scopedCandidates.filter((session) => {
    const status = sessionStatusMap?.[session.id];
    return status != null && LIVE_STATUSES.has(status.type);
  });

  if (liveCandidates.length === 1) {
    return liveCandidates[0].id;
  }

  // Ambiguous — do not guess
  return undefined;
}
