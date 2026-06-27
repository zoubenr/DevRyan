import { describe, expect, test } from 'bun:test';
import { normalizeInteractionUpdateToSdkMessage } from './index.js';

// Locks the additive turn-ended -> usage mapping. Cursor's @cursor/sdk emits
// { type: 'turn-ended', usage: { inputTokens, outputTokens, cacheReadTokens,
// cacheWriteTokens } } to onDelta; before this, the normalizer hit `return null`
// and DevRyan reported 0 tokens for every cursor session.
describe('normalizeInteractionUpdateToSdkMessage: turn-ended usage', () => {
  test('maps full usage to OpenCode info.tokens shape', () => {
    expect(normalizeInteractionUpdateToSdkMessage({
      type: 'turn-ended',
      usage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 9000, cacheWriteTokens: 50 },
    })).toEqual({
      type: 'usage',
      tokens: { input: 1200, output: 340, reasoning: 0, cache: { read: 9000, write: 50 } },
    });
  });

  test('floors and clamps malformed token counts (float/negative/NaN -> safe ints)', () => {
    expect(normalizeInteractionUpdateToSdkMessage({
      type: 'turn-ended',
      usage: { inputTokens: 3.9, outputTokens: -5, cacheReadTokens: Number.NaN, cacheWriteTokens: 50 },
    })).toEqual({
      type: 'usage',
      tokens: { input: 3, output: 0, reasoning: 0, cache: { read: 0, write: 50 } },
    });
  });

  test('returns null when turn-ended carries no usage object', () => {
    expect(normalizeInteractionUpdateToSdkMessage({ type: 'turn-ended' })).toBeNull();
  });

  test('returns null for an all-zero usage (never clobbers a prior real usage)', () => {
    expect(normalizeInteractionUpdateToSdkMessage({
      type: 'turn-ended',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })).toBeNull();
  });

  test('unwraps a nested { update } envelope', () => {
    expect(normalizeInteractionUpdateToSdkMessage({
      update: { type: 'turn-ended', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    })).toEqual({
      type: 'usage',
      tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
    });
  });

  test('unknown update types still return null (no accidental usage)', () => {
    expect(normalizeInteractionUpdateToSdkMessage({ type: 'some-future-event', usage: { inputTokens: 5 } })).toBeNull();
  });
});
