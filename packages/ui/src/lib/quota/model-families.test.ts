import { describe, expect, test } from 'bun:test';

import { getUsageModelDisplayInfo } from './model-families';

describe('quota model display info', () => {
  test('uses usage metadata when rendering Antigravity model rows', () => {
    expect(getUsageModelDisplayInfo('antigravity/gemini-3-flash', {
      displayName: 'Gemini 3 Flash',
      contextLabel: '1M',
    })).toEqual({
      displayName: 'Gemini 3 Flash',
      contextLabel: '1M',
    });
  });

  test('falls back to scoped model display names when metadata is unavailable', () => {
    expect(getUsageModelDisplayInfo('antigravity/gemini-3-flash', {})).toEqual({
      displayName: 'gemini-3-flash',
      contextLabel: null,
    });
  });
});
