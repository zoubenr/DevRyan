import type { StreamPhase } from '../types';
import { getPlanBlockId, getPlanImplementationKey } from '@/lib/messages/actionablePlan';

const MIN_SKELETON_LINES = 8;
const MAX_SKELETON_LINES = 48;
const ESTIMATED_CHARS_PER_LINE = 72;
const ESTIMATED_LONG_PLAN_CHARS = 2200;

export const PLAN_CARD_COLLAPSED_CONTENT_LINES = 8;
export const PLAN_CARD_COLLAPSED_LINE_HEIGHT_PX = 24;
export const PLAN_CARD_BODY_VERTICAL_PADDING_PX = 32;
export const getPlanCardCollapsedMaxHeight = ({
  lineCount = PLAN_CARD_COLLAPSED_CONTENT_LINES,
  lineHeightPx = PLAN_CARD_COLLAPSED_LINE_HEIGHT_PX,
  bodyVerticalPaddingPx = PLAN_CARD_BODY_VERTICAL_PADDING_PX,
}: {
  lineCount?: number;
  lineHeightPx?: number;
  bodyVerticalPaddingPx?: number;
} = {}): number => (lineCount * lineHeightPx) + bodyVerticalPaddingPx;

export const PLAN_CARD_COLLAPSED_MAX_HEIGHT_PX = getPlanCardCollapsedMaxHeight();
export const PLAN_CARD_EXPAND_BUTTON_SIZE_PX = 28;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export type PlanOverlayPhase = 'initial' | 'streaming' | 'exiting' | 'done';

export interface PlanSkeletonRevealState {
  hasPlanText: boolean;
  showInitialSkeleton: boolean;
  showOverlaySkeleton: boolean;
  revealPercent: number;
  skeletonLineCount: number;
}

export const resolvePlanCardDisplayText = ({
  rawPlanText,
  throttledPlanText,
  isStreaming,
}: {
  rawPlanText: string;
  throttledPlanText: string;
  isStreaming: boolean;
}): string => {
  return isStreaming ? throttledPlanText : rawPlanText;
};

export const getPlanSkeletonLineCount = (planText: string): number => {
  const trimmed = planText.trim();
  if (trimmed.length === 0) return MIN_SKELETON_LINES;

  const explicitLineCount = trimmed.split(/\r?\n/).length;
  const estimatedWrappedLineCount = Math.ceil(trimmed.length / ESTIMATED_CHARS_PER_LINE);

  return clamp(
    Math.max(MIN_SKELETON_LINES, explicitLineCount, estimatedWrappedLineCount),
    MIN_SKELETON_LINES,
    MAX_SKELETON_LINES,
  );
};

// Skeleton line count must only grow during a session — shrinking would
// reflow the skeleton as the streamed plan tokens arrive, which reads as
// jitter. Callers stash the previous value and pass it as `previous`.
export const getStableSkeletonLineCount = (
  planText: string,
  previous: number,
): number => {
  const next = getPlanSkeletonLineCount(planText);
  return next > previous ? next : previous;
};

export const getStreamingRevealPercent = ({
  minWindowElapsed,
  planText,
}: {
  minWindowElapsed: boolean;
  planText: string;
}): number => {
  if (!minWindowElapsed) return 0;

  const textLength = planText.trim().length;
  if (textLength === 0) return 0;

  // Decision: approximate progress from current text length instead of trying to
  // predict the model's final plan length. This keeps the skeleton moving while
  // preserving coverage over the not-yet-revealed tail of longer plans.
  const normalizedLength = clamp(textLength / ESTIMATED_LONG_PLAN_CHARS, 0, 1);
  const raw = clamp(18 + Math.sqrt(normalizedLength) * 72, 18, 90);
  // Quantize to 2% buckets so streaming chunks don't restart the clip-path
  // transition on every token — fewer interrupted reveals reads as smoother.
  return Math.round(raw / 2) * 2;
};

export const getPlanSkeletonRevealState = ({
  minWindowElapsed,
  planText,
  streamPhase,
}: {
  minWindowElapsed: boolean;
  planText: string;
  streamPhase: StreamPhase;
}): PlanSkeletonRevealState => {
  const hasPlanText = planText.trim().length > 0;
  const isComplete = streamPhase === 'completed';

  return {
    hasPlanText,
    showInitialSkeleton: !isComplete && !hasPlanText,
    showOverlaySkeleton: !isComplete && hasPlanText,
    revealPercent: isComplete ? 100 : getStreamingRevealPercent({ minWindowElapsed, planText }),
    skeletonLineCount: getPlanSkeletonLineCount(planText),
  };
};

// Higher-level phase used by PlanCard to drive crossfade transitions instead
// of two unrelated booleans. `exiting` keeps the overlay mounted briefly so it
// can fade out via opacity before unmount.
export const getPlanOverlayPhase = ({
  reveal,
  isExitingOverlay,
}: {
  reveal: PlanSkeletonRevealState;
  isExitingOverlay: boolean;
}): PlanOverlayPhase => {
  if (reveal.showInitialSkeleton) return 'initial';
  if (reveal.showOverlaySkeleton) return 'streaming';
  if (isExitingOverlay) return 'exiting';
  return 'done';
};

export const getPlanOverlayClipPercent = ({
  phase,
  revealPercent,
}: {
  phase: PlanOverlayPhase;
  revealPercent: number;
}): number => {
  if (phase === 'initial') return 0;
  if (phase === 'streaming') return clamp(revealPercent, 0, 100);
  return 100;
};

export const getPlanCardImplementationKey = (
  sessionId: string,
  sourceMessageId: string,
): string => getPlanImplementationKey(sessionId, getPlanBlockId(sourceMessageId, 0));
