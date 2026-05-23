import { describe, expect, test } from 'bun:test';

import {
  PLAN_CARD_BODY_VERTICAL_PADDING_PX,
  PLAN_CARD_COLLAPSED_CONTENT_LINES,
  getPlanCardImplementationKey,
  getPlanOverlayPhase,
  getPlanOverlayClipPercent,
  getPlanSkeletonLineCount,
  getPlanSkeletonRevealState,
  getStableSkeletonLineCount,
  getPlanCardCollapsedMaxHeight,
  getStreamingRevealPercent,
  resolvePlanCardDisplayText,
} from './planCardReveal';

describe('getPlanSkeletonRevealState', () => {
  test('uses the initial skeleton while streaming before plan text exists', () => {
    expect(getPlanSkeletonRevealState({
      minWindowElapsed: false,
      planText: '',
      streamPhase: 'streaming',
    })).toEqual({
      hasPlanText: false,
      showInitialSkeleton: true,
      showOverlaySkeleton: false,
      revealPercent: 0,
      skeletonLineCount: 8,
    });
  });

  test('keeps plan text mounted while the skeleton overlay reveals it during streaming', () => {
    const state = getPlanSkeletonRevealState({
      minWindowElapsed: true,
      planText: '# Plan\n\n1. Do work',
      streamPhase: 'streaming',
    });

    expect(state.hasPlanText).toBe(true);
    expect(state.showInitialSkeleton).toBe(false);
    expect(state.showOverlaySkeleton).toBe(true);
    expect(state.revealPercent).toBeGreaterThan(0);
    expect(state.revealPercent).toBeLessThan(100);
  });

  test('removes the skeleton overlay when the plan is complete', () => {
    expect(getPlanSkeletonRevealState({
      minWindowElapsed: true,
      planText: '# Plan\n\n1. Do work',
      streamPhase: 'completed',
    })).toEqual({
      hasPlanText: true,
      showInitialSkeleton: false,
      showOverlaySkeleton: false,
      revealPercent: 100,
      skeletonLineCount: 8,
    });
  });
});

describe('resolvePlanCardDisplayText', () => {
  test('uses throttled text while streaming so layout matches rendered markdown', () => {
    const rawPlanText = '# Plan\n\n' + 'Implementation detail. '.repeat(120);
    const throttledPlanText = '# Plan\n\n1. First visible task';

    expect(resolvePlanCardDisplayText({
      rawPlanText,
      throttledPlanText,
      isStreaming: true,
    })).toBe(throttledPlanText);
  });

  test('uses raw text once streaming has completed', () => {
    const rawPlanText = '# Plan\n\n' + 'Implementation detail. '.repeat(120);
    const throttledPlanText = '# Plan\n\n1. First visible task';

    expect(resolvePlanCardDisplayText({
      rawPlanText,
      throttledPlanText,
      isStreaming: false,
    })).toBe(rawPlanText);
  });
});

describe('getStreamingRevealPercent', () => {
  test('holds the skeleton over the text until the minimum window elapses', () => {
    expect(getStreamingRevealPercent({ minWindowElapsed: false, planText: '# Plan' })).toBe(0);
  });

  test('advances the reveal as streamed plan text grows', () => {
    const shortReveal = getStreamingRevealPercent({ minWindowElapsed: true, planText: '# Plan' });
    const longReveal = getStreamingRevealPercent({
      minWindowElapsed: true,
      planText: '# Plan\n\n' + 'Add implementation detail. '.repeat(80),
    });

    expect(longReveal).toBeGreaterThan(shortReveal);
    expect(longReveal).toBeLessThan(100);
  });
});

describe('getPlanSkeletonLineCount', () => {
  test('keeps at least eight skeleton rows for the initial collapsed card', () => {
    expect(getPlanSkeletonLineCount('')).toBe(8);
  });

  test('adds rows for long streamed plans instead of stopping at eight lines', () => {
    expect(getPlanSkeletonLineCount('Plan detail. '.repeat(80))).toBeGreaterThan(8);
  });
});

describe('getPlanCardCollapsedMaxHeight', () => {
  test('reserves eight lines plus vertical body padding', () => {
    expect(getPlanCardCollapsedMaxHeight({
      lineCount: PLAN_CARD_COLLAPSED_CONTENT_LINES,
      bodyVerticalPaddingPx: PLAN_CARD_BODY_VERTICAL_PADDING_PX,
    })).toBe(224);
  });
});

describe('getStableSkeletonLineCount', () => {
  test('grows monotonically as text streams in', () => {
    const short = getStableSkeletonLineCount('Plan detail. '.repeat(2), 0);
    const longer = getStableSkeletonLineCount('Plan detail. '.repeat(40), short);
    expect(longer === short || longer > short).toBe(true);
  });

  test('never shrinks below the previously observed maximum', () => {
    const peak = getStableSkeletonLineCount('Plan detail. '.repeat(80), 0);
    const shrunk = getStableSkeletonLineCount('', peak);
    expect(shrunk).toBe(peak);
  });
});

describe('getPlanOverlayPhase', () => {
  test('returns initial when only the placeholder skeleton is showing', () => {
    const reveal = getPlanSkeletonRevealState({
      minWindowElapsed: false,
      planText: '',
      streamPhase: 'streaming',
    });
    expect(getPlanOverlayPhase({ reveal, isExitingOverlay: false })).toBe('initial');
  });

  test('returns streaming while plan text is being revealed', () => {
    const reveal = getPlanSkeletonRevealState({
      minWindowElapsed: true,
      planText: '# Plan\n\n1. Do work',
      streamPhase: 'streaming',
    });
    expect(getPlanOverlayPhase({ reveal, isExitingOverlay: false })).toBe('streaming');
  });

  test('returns exiting while the overlay fades out after completion', () => {
    const reveal = getPlanSkeletonRevealState({
      minWindowElapsed: true,
      planText: '# Plan\n\n1. Do work',
      streamPhase: 'completed',
    });
    expect(getPlanOverlayPhase({ reveal, isExitingOverlay: true })).toBe('exiting');
  });

  test('returns done once the overlay has unmounted', () => {
    const reveal = getPlanSkeletonRevealState({
      minWindowElapsed: true,
      planText: '# Plan\n\n1. Do work',
      streamPhase: 'completed',
    });
    expect(getPlanOverlayPhase({ reveal, isExitingOverlay: false })).toBe('done');
  });
});

describe('getPlanOverlayClipPercent', () => {
  test('keeps the overlay fully covering text during the initial skeleton phase', () => {
    expect(getPlanOverlayClipPercent({ phase: 'initial', revealPercent: 40 })).toBe(0);
  });

  test('uses the reveal percent while the plan streams', () => {
    expect(getPlanOverlayClipPercent({ phase: 'streaming', revealPercent: 42 })).toBe(42);
  });

  test('fully reveals text while the overlay exits or is done', () => {
    expect(getPlanOverlayClipPercent({ phase: 'exiting', revealPercent: 64 })).toBe(100);
    expect(getPlanOverlayClipPercent({ phase: 'done', revealPercent: 64 })).toBe(100);
  });
});

describe('getPlanCardImplementationKey', () => {
  test('uses the first plan block for the rendered assistant plan card', () => {
    expect(getPlanCardImplementationKey('session-a', 'msg_2_assistant')).toBe(
      'session-a:msg_2_assistant:plan:0',
    );
  });
});
