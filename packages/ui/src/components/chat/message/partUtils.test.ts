import { describe, expect, test } from 'bun:test';
import type { Part } from '@opencode-ai/sdk/v2';
import { collapseExactDuplicateAdjacentTextParts, collapseSupersededTodoWrites } from './partUtils';

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

const toolPart = (id: string, tool: string): Part => ({
  id,
  type: 'tool',
  tool,
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

  test('collapses duplicates that differ only by incidental whitespace', () => {
    const parts = collapseExactDuplicateAdjacentTextParts([
      textPart('a', 'Checking the current file state and finishing the move.'),
      textPart('b', 'Checking the current   file state\nand finishing the move.'),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['a']);
  });

  test('keeps genuinely different adjacent text parts', () => {
    const parts = collapseExactDuplicateAdjacentTextParts([
      textPart('a', 'Checking the current file state and finishing the move.'),
      textPart('b', 'Now running the verification suite to confirm the change.'),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['a', 'b']);
  });
});

describe('collapseSupersededTodoWrites', () => {
  test('keeps only the last todowrite, preserving other parts and order', () => {
    const parts = collapseSupersededTodoWrites([
      toolPart('t1', 'todowrite'),
      toolPart('r1', 'read'),
      toolPart('t2', 'todowrite'),
      textPart('x', 'Working on it.'),
      toolPart('t3', 'todowrite'),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['r1', 'x', 't3']);
  });

  test('is a no-op with a single todowrite', () => {
    const parts = collapseSupersededTodoWrites([
      toolPart('r1', 'read'),
      toolPart('t1', 'todowrite'),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['r1', 't1']);
  });

  test('is a no-op when there are no todo tools', () => {
    const parts = collapseSupersededTodoWrites([
      toolPart('r1', 'read'),
      textPart('x', 'Done.'),
    ]);

    expect(parts.map((part) => part.id)).toEqual(['r1', 'x']);
  });

  test('turn-scoped: keeps only the part matching keepPartId', () => {
    const parts = collapseSupersededTodoWrites([
      toolPart('t1', 'todowrite'),
      toolPart('t2', 'todowrite'),
      textPart('x', 'note'),
    ], 't1');

    expect(parts.map((part) => part.id)).toEqual(['t1', 'x']);
  });

  test('turn-scoped: hides all todo rows when the survivor lives in another message', () => {
    const parts = collapseSupersededTodoWrites([
      toolPart('t1', 'todowrite'),
      toolPart('r1', 'read'),
      toolPart('t2', 'todowrite'),
    ], 't-in-other-message');

    expect(parts.map((part) => part.id)).toEqual(['r1']);
  });
});
