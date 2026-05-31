import { describe, expect, test } from 'bun:test';
import { areRelevantTurnGroupingContextsEqual } from './renderCompare';
import type { TurnGroupingContext } from '../lib/turns/types';

type TestTurnGroupingContext = TurnGroupingContext & {
  isTurnWorking: boolean;
};

const createTurnContext = (overrides: Partial<TestTurnGroupingContext> = {}): TestTurnGroupingContext => ({
  turnId: 'turn-1',
  isFirstAssistantInTurn: true,
  isLastAssistantInTurn: true,
  hasTools: true,
  hasReasoning: false,
  isWorking: false,
  isTurnWorking: false,
  ...overrides,
});

describe('areRelevantTurnGroupingContextsEqual', () => {
  test('treats turn-level working state as render-relevant for assistant messages', () => {
    const idle = createTurnContext({ isTurnWorking: false });
    const working = createTurnContext({ isTurnWorking: true });

    expect(areRelevantTurnGroupingContextsEqual(idle, working, 'assistant-1', false)).toBe(false);
  });

  test('ignores turn-level working state for user messages', () => {
    const idle = createTurnContext({ isTurnWorking: false });
    const working = createTurnContext({ isTurnWorking: true });

    expect(areRelevantTurnGroupingContextsEqual(idle, working, 'user-1', true)).toBe(true);
  });

  test('treats summary source changes as render-relevant for assistant messages', () => {
    const first = createTurnContext({ summarySourceMessageId: 'assistant-1', summarySourcePartId: 'part-1' });
    const second = createTurnContext({ summarySourceMessageId: 'assistant-2', summarySourcePartId: 'part-2' });

    expect(areRelevantTurnGroupingContextsEqual(first, second, 'assistant-1', false)).toBe(false);
  });

  test('treats turn-level plan mode source changes as render-relevant for assistant messages', () => {
    const normal = createTurnContext({ isPlanModeSource: false });
    const planMode = createTurnContext({ isPlanModeSource: true });

    expect(areRelevantTurnGroupingContextsEqual(normal, planMode, 'assistant-1', false)).toBe(false);
  });
});
