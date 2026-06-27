export const ORPHAN_FRAGMENT_MAX_LENGTH = 200;

/**
 * Detects a short, mid-sentence assistant text fragment that is wedged between
 * non-text (tool/reasoning) parts — e.g. composer-2.5 emitting a dangling
 * "...existing HTML for conventions to reuse." between two tool calls. These
 * read as random noise next to the real narration, so they are dropped from
 * display.
 *
 * Deliberately conservative so it never hides a real message:
 *  - only fires when the trimmed text starts with a lowercase letter (a
 *    continuation — sentences, answers, and plan text never do; plan text
 *    starts with the `<!--plan-->` sentinel or `#`),
 *  - only when surrounded by non-text parts on BOTH sides (an interleaved
 *    fragment, never the leading intro or the final answer),
 *  - only for short tails (<= ORPHAN_FRAGMENT_MAX_LENGTH chars).
 */
export const isOrphanNarrationFragment = (
  text: string,
  prevPartType: string | null | undefined,
  nextPartType: string | null | undefined,
): boolean => {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > ORPHAN_FRAGMENT_MAX_LENGTH) {
    return false;
  }
  if (!prevPartType || prevPartType === 'text') {
    return false;
  }
  if (!nextPartType || nextPartType === 'text') {
    return false;
  }
  return /^[a-z]/.test(trimmed);
};
