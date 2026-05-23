import { describe, expect, test } from 'bun:test';
import type { Part } from '@opencode-ai/sdk/v2';
import { collapseExactDuplicateAdjacentTextParts } from './partUtils';

const textPart = (id: string, text: string): Part => ({
  id,
  type: 'text',
  text,
} as Part);

const reasoningPart = (id: string, text: string): Part => ({
  id,
  type: 'reasoning',
  text,
} as Part);

describe('collapseExactDuplicateAdjacentTextParts', () => {
  test('collapses exact duplicate adjacent assistant text parts', () => {
    const text = 'Checking the current file state and finishing the move.';
    const parts = collapseExactDuplicateAdjacentTextParts([
      textPart('a', text),
      textPart('b', text),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['a']);
  });

  test('keeps non-adjacent duplicate assistant text parts', () => {
    const text = 'Checking the current file state and finishing the move.';
    const parts = collapseExactDuplicateAdjacentTextParts([
      textPart('a', text),
      reasoningPart('r', 'Thinking about the move.'),
      textPart('b', text),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['a', 'r', 'b']);
  });

  test('keeps short repeated text that may be intentional', () => {
    const parts = collapseExactDuplicateAdjacentTextParts([
      textPart('a', 'ha'),
      textPart('b', 'ha'),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['a', 'b']);
  });

  test('does not collapse reasoning parts', () => {
    const text = 'Checking the current file state and finishing the move.';
    const parts = collapseExactDuplicateAdjacentTextParts([
      reasoningPart('a', text),
      reasoningPart('b', text),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['a', 'b']);
  });
});
