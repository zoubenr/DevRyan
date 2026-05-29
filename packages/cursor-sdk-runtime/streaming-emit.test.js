import { describe, expect, test } from 'bun:test';
import { computeIncrementalTextDelta } from './index.js';

describe('computeIncrementalTextDelta', () => {
  test('returns appended slice for growing prefix text', () => {
    expect(computeIncrementalTextDelta('Hello', 'Hello world')).toBe(' world');
  });

  test('returns empty string when text is unchanged', () => {
    expect(computeIncrementalTextDelta('Hello world', 'Hello world')).toBe('');
  });

  test('returns null for non-prefix replacements', () => {
    expect(computeIncrementalTextDelta('Hello world', 'Goodbye')).toBeNull();
  });

  test('returns full next text when previous is empty', () => {
    expect(computeIncrementalTextDelta('', 'Hello')).toBe('Hello');
  });
});
