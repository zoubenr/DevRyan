export const PLAN_CARD_SENTINEL = '<!--plan-->';
export const PLAN_MODE_INSTRUCTION_PREFIX = 'User has requested to enter plan mode';

const PLAN_CARD_SENTINEL_LINE_PATTERN = /(^|[\r\n])([ \t]*<!--plan-->[ \t]*)(?:\r?\n|$)/;
const PLAN_MODE_SECTION_HEADINGS = new Set([
  'context',
  'critical files',
  'implementation',
  'visual details',
  'verification',
]);
const MARKDOWN_HEADING_LINE = /^\s{0,3}(#{1,2})\s+(.+?)\s*$/;

const normalizePlanSectionHeading = (heading) => (
  heading.trim().toLowerCase().replace(/\s+/g, ' ')
);

const countPlanModeSectionHeadings = (text) => {
  if (typeof text !== 'string' || text.length === 0) return 0;

  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = MARKDOWN_HEADING_LINE.exec(line);
    if (!match) continue;
    const level = match[1]?.length ?? 0;
    const heading = normalizePlanSectionHeading(match[2] ?? '');
    if (level === 1 || PLAN_MODE_SECTION_HEADINGS.has(heading)) {
      count += 1;
    }
  }
  return count;
};

const findStructuredPlanStartIndex = (text) => {
  if (typeof text !== 'string' || text.length === 0) return -1;

  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const match = MARKDOWN_HEADING_LINE.exec(line);
    if (match) {
      const level = match[1]?.length ?? 0;
      const heading = normalizePlanSectionHeading(match[2] ?? '');
      if (level === 1 || PLAN_MODE_SECTION_HEADINGS.has(heading)) {
        return offset;
      }
    }
    offset += line.length + 1;
  }
  return -1;
};

const splitStructuredPlanFallback = (text) => {
  const planStart = findStructuredPlanStartIndex(text);
  if (planStart < 0) return null;

  const planText = text.slice(planStart);
  if (countPlanModeSectionHeadings(planText) < 2) return null;

  return {
    preambleText: text.slice(0, planStart),
    planText,
  };
};

export const splitPlanCardSentinel = (text) => {
  if (typeof text !== 'string' || text.length === 0) return null;

  const match = PLAN_CARD_SENTINEL_LINE_PATTERN.exec(text);
  if (!match || match.index < 0) return null;

  const linePrefix = match[1] ?? '';
  const sentinelStart = match.index + linePrefix.length;
  return {
    preambleText: text.slice(0, sentinelStart),
    planText: text.slice(match.index + match[0].length),
  };
};

export const normalizePlanModeAssistantText = (text, { isPlanModePrompt = false } = {}) => {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (splitPlanCardSentinel(text)) return text;
  if (!isPlanModePrompt) return text;

  const fallback = splitStructuredPlanFallback(text);
  if (!fallback?.planText?.trim()) return text;

  const preamble = fallback.preambleText.trimEnd();
  const planBody = fallback.planText.trimStart();
  if (!planBody) return text;

  return preamble.length > 0
    ? `${preamble}\n${PLAN_CARD_SENTINEL}\n${planBody}`
    : `${PLAN_CARD_SENTINEL}\n${planBody}`;
};

export const getPartText = (part) => {
  if (!part || typeof part !== 'object') return '';
  const rawText = typeof part.text === 'string' ? part.text : '';
  const contentText = typeof part.content === 'string' ? part.content : '';
  const valueText = typeof part.value === 'string' ? part.value : '';
  return [rawText, contentText, valueText].reduce((best, candidate) => (
    candidate.length > best.length ? candidate : best
  ), '');
};

export const normalizePlanModeAssistantParts = (parts, { isPlanModePrompt = false } = {}) => {
  if (!Array.isArray(parts) || parts.length === 0 || !isPlanModePrompt) {
    return parts;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type !== 'text') continue;

    const existingText = getPartText(part);
    const normalizedText = normalizePlanModeAssistantText(existingText, { isPlanModePrompt: true });
    if (normalizedText === existingText) continue;

    return parts.map((current, currentIndex) => (
      currentIndex === index
        ? { ...current, text: normalizedText }
        : current
    ));
  }

  const reasoningEntries = parts
    .map((part, index) => ({ part, index, text: getPartText(part).trim() }))
    .filter((entry) => entry.part?.type === 'reasoning' && entry.text.length > 0);

  if (reasoningEntries.length === 0) return parts;

  for (let index = reasoningEntries.length - 1; index >= 0; index -= 1) {
    const reasoningEntry = reasoningEntries[index];
    const reasoningSplit = splitStructuredPlanFallback(reasoningEntry.text);
    if (!reasoningSplit?.planText?.trim()) continue;

    const partsBeforePlan = parts.slice(0, reasoningEntry.index);
    const textPart = partsBeforePlan.find((part) => part?.type === 'text') ?? null;
    const existingText = getPartText(textPart);
    const earlierReasoningText = reasoningEntries
      .filter((entry) => entry.index < reasoningEntry.index)
      .map((entry) => entry.text);
    const preamble = [
      existingText.trim(),
      ...earlierReasoningText,
    ].filter(Boolean).join('\n');
    const promotedText = preamble.length > 0
      ? `${preamble}\n${PLAN_CARD_SENTINEL}\n${reasoningSplit.planText.trimStart()}`
      : `${PLAN_CARD_SENTINEL}\n${reasoningSplit.planText.trimStart()}`;

    const nextParts = partsBeforePlan.filter((part) => part?.type !== 'reasoning');
    if (textPart) {
      return nextParts.map((part) => (
        part === textPart
          ? { ...part, text: promotedText }
          : part
      ));
    }

    return [
      ...nextParts,
      {
        id: `${parts[0]?.messageID ?? 'assistant'}_text_promoted`,
        sessionID: parts[0]?.sessionID,
        messageID: parts[0]?.messageID,
        type: 'text',
        text: promotedText,
      },
    ];
  }

  return parts;
};
