const TRAILING_SELECTION_WHITESPACE = /[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/u;

export const normalizeSelectionLineBreaks = (value: string): string => value.replace(/\r\n?/g, '\n');

export const sanitizeChatSelectionCopyText = (value: string): string => {
  const normalized = normalizeSelectionLineBreaks(value);
  return normalized.replace(TRAILING_SELECTION_WHITESPACE, '');
};
