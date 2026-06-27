import { describe, expect, test } from 'bun:test';

import { normalizeSelectionLineBreaks, sanitizeChatSelectionCopyText } from './selectionClipboard';

describe('selection clipboard helpers', () => {
  test('normalizes CRLF and bare carriage returns', () => {
    expect(normalizeSelectionLineBreaks('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  test('removes trailing line breaks from copied chat selections', () => {
    expect(sanitizeChatSelectionCopyText('hello\n\n')).toBe('hello');
  });

  test('removes trailing line breaks after CRLF normalization', () => {
    expect(sanitizeChatSelectionCopyText('hello\r\n\r\n')).toBe('hello');
  });

  test('preserves intentional interior blank lines', () => {
    expect(sanitizeChatSelectionCopyText('first\n\nsecond\n\n')).toBe('first\n\nsecond');
  });

  test('preserves leading whitespace while trimming trailing selection whitespace', () => {
    expect(sanitizeChatSelectionCopyText('  indented value  \n')).toBe('  indented value');
  });

  test('returns an empty string for whitespace-only selections', () => {
    expect(sanitizeChatSelectionCopyText('\n\t  \r\n')).toBe('');
  });
});
