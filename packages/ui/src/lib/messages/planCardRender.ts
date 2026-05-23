import type { PlanCardSentinelSplit } from './actionablePlan';

export type PlanCardRenderSegment =
  | { kind: 'preamble'; text: string }
  | { kind: 'plan-card' };

export const buildPlanCardRenderSegments = ({
  groupText,
  groupStart,
  groupEnd,
  messagePlan,
  planCardRendered,
}: {
  groupText: string;
  groupStart: number;
  groupEnd: number;
  messagePlan: PlanCardSentinelSplit;
  planCardRendered: boolean;
}): { segments: PlanCardRenderSegment[]; planCardRendered: boolean } => {
  const planStart = messagePlan.preambleText.length;
  const planEnd = planStart + messagePlan.planText.length;
  const segments: PlanCardRenderSegment[] = [];
  let rendered = planCardRendered;

  if (groupEnd <= planStart) {
    if (groupText.trim().length > 0) {
      segments.push({ kind: 'preamble', text: groupText });
    }
    return { segments, planCardRendered: rendered };
  }

  if (groupStart >= planEnd) {
    if (groupText.trim().length > 0) {
      segments.push({ kind: 'preamble', text: groupText });
    }
    return { segments, planCardRendered: rendered };
  }

  if (groupStart < planStart) {
    const preamblePortion = groupText.slice(0, Math.max(0, planStart - groupStart));
    if (preamblePortion.trim().length > 0) {
      segments.push({ kind: 'preamble', text: preamblePortion });
    }
  }

  if (!rendered && groupEnd > planStart && messagePlan.planText.trim().length > 0) {
    segments.push({ kind: 'plan-card' });
    rendered = true;
  }

  return { segments, planCardRendered: rendered };
};
