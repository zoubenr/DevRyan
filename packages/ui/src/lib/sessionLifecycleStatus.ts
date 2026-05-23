/**
 * Pure derivation of a session's lifecycle status. Consumed by the sidebar
 * indicator and by the future plan-card rebuild. Composing the various
 * signals (plan-mode toggle, pending questions, plan indicator, assistant
 * activity, SDK session-status error) in one place ensures the indicator
 * never disagrees with the chat content.
 *
 * No React, no store reads — call this from a hook that pulls each input
 * from its source.
 */

export type AssistantActivity =
  | 'idle'
  | 'streaming'
  | 'tooling'
  | 'cooldown'
  | 'permission';

export type PlanIndicatorPhase = 'proposed' | 'implementing' | 'completed' | null;

export interface SessionLifecycleInputs {
  /** Is the plan-mode toggle currently on for this session? */
  planModeOn: boolean;
  /** Number of pending question requests for this session. */
  questionCount: number;
  /**
   * Current plan-indicator phase from useSessionUIStore.sessionPlanIndicator.
   * `null` when no plan has been proposed/implemented yet.
   */
  planIndicatorState: PlanIndicatorPhase;
  /** Assistant activity (from a refactored useAssistantStatus(sessionId)). */
  assistantActivity: AssistantActivity;
  /**
   * SDK session-status error message, if any. Truthy means the session is
   * in an error state regardless of other signals.
   */
  sdkSessionStatusError?: string | null;
}

export type SessionLifecycleStatus =
  | { kind: 'idle'; planModeOn: boolean }
  | { kind: 'streaming'; planModeOn: boolean }
  | { kind: 'awaiting-question'; questionCount: number }
  | { kind: 'plan-proposed'; sourceMessageId?: string }
  | { kind: 'plan-executing'; sourceMessageId?: string }
  | { kind: 'error'; message: string };

const ACTIVE_ACTIVITIES: ReadonlySet<AssistantActivity> = new Set([
  'streaming',
  'tooling',
  'cooldown',
  'permission',
]);

/**
 * Composition order (first match wins):
 *   1. `error`               — SDK session-status error trumps everything.
 *   2. `awaiting-question`   — pending questions block any plan/streaming state.
 *   3. `plan-executing`      — plan indicator is "implementing".
 *   4. `plan-proposed`       — plan indicator is "proposed" AND assistant idle.
 *                              While streaming, prefer the streaming state so the
 *                              user sees activity rather than a stale proposed flag.
 *   5. `streaming`           — assistant is doing something.
 *   6. `idle`                — fallback.
 */
export const deriveSessionLifecycleStatus = (
  inputs: SessionLifecycleInputs,
): SessionLifecycleStatus => {
  if (inputs.sdkSessionStatusError) {
    return { kind: 'error', message: inputs.sdkSessionStatusError };
  }

  if (inputs.questionCount > 0) {
    return { kind: 'awaiting-question', questionCount: inputs.questionCount };
  }

  const isActive = ACTIVE_ACTIVITIES.has(inputs.assistantActivity);

  if (inputs.planIndicatorState === 'implementing') {
    return { kind: 'plan-executing' };
  }

  if (inputs.planIndicatorState === 'proposed' && !isActive) {
    return { kind: 'plan-proposed' };
  }

  if (isActive) {
    return { kind: 'streaming', planModeOn: inputs.planModeOn };
  }

  return { kind: 'idle', planModeOn: inputs.planModeOn };
};
