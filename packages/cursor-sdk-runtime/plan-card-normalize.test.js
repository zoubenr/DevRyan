import { describe, expect, test } from 'bun:test';
import {
  normalizePlanModeAssistantParts,
  normalizePlanModeAssistantText,
  PLAN_CARD_SENTINEL,
  PLAN_MODE_INSTRUCTION_PREFIX,
} from './plan-card-normalize.js';

const structuredPlanBody = [
  '# Cursor Plan Card Fix',
  '',
  '## Context',
  '',
  'Cursor models omit the sentinel.',
  '',
  '## Implementation',
  '',
  '1. Add fallback detection.',
].join('\n');

describe('normalizePlanModeAssistantText', () => {
  test('leaves sentinel-backed text unchanged', () => {
    const text = `intro\n${PLAN_CARD_SENTINEL}\n# Plan`;
    expect(normalizePlanModeAssistantText(text, { isPlanModePrompt: true })).toBe(text);
  });

  test('injects a sentinel before structured plan-mode output', () => {
    expect(normalizePlanModeAssistantText(`intro\n${structuredPlanBody}`, { isPlanModePrompt: true }))
      .toBe(`intro\n${PLAN_CARD_SENTINEL}\n${structuredPlanBody}`);
  });

  test('does not mutate non-plan prompts', () => {
    expect(normalizePlanModeAssistantText(structuredPlanBody, { isPlanModePrompt: false }))
      .toBe(structuredPlanBody);
  });
});

describe('normalizePlanModeAssistantParts', () => {
  test('promotes structured plan content from trailing reasoning parts', () => {
    const parts = normalizePlanModeAssistantParts([
      {
        id: 'msg_assistant_text',
        type: 'text',
        text: 'I inspected the repo first.',
      },
      {
        id: 'msg_assistant_reasoning',
        type: 'reasoning',
        text: structuredPlanBody,
      },
    ], { isPlanModePrompt: true });

    expect(parts).toHaveLength(1);
    expect(parts[0]?.text).toBe(
      `I inspected the repo first.\n${PLAN_CARD_SENTINEL}\n${structuredPlanBody}`,
    );
  });

  test('drops assistant chatter after promoted reasoning plan content', () => {
    const parts = normalizePlanModeAssistantParts([
      {
        id: 'msg_assistant_text_intro',
        type: 'text',
        text: 'I inspected the repo first.',
      },
      {
        id: 'msg_assistant_reasoning',
        type: 'reasoning',
        text: structuredPlanBody,
      },
      {
        id: 'msg_assistant_text_tail',
        type: 'text',
        text: 'tests pass.',
      },
    ], { isPlanModePrompt: true });

    expect(parts).toHaveLength(1);
    expect(parts[0]?.text).toBe(
      `I inspected the repo first.\n${PLAN_CARD_SENTINEL}\n${structuredPlanBody}`,
    );
  });

  test('normalizes the last text part when Cursor emits plan text after tools', () => {
    const parts = normalizePlanModeAssistantParts([
      {
        id: 'msg_assistant_part_000001_text',
        type: 'text',
        text: 'I inspected the repository first.',
      },
      {
        id: 'msg_assistant_part_000002_tool_tool_1',
        type: 'tool',
        tool: 'grep',
        state: { status: 'completed' },
      },
      {
        id: 'msg_assistant_part_000003_text',
        type: 'text',
        text: structuredPlanBody,
      },
    ], { isPlanModePrompt: true });

    expect(parts).toHaveLength(3);
    expect(parts[0]?.text).toBe('I inspected the repository first.');
    expect(parts[1]?.type).toBe('tool');
    expect(parts[2]?.text).toBe(`${PLAN_CARD_SENTINEL}\n${structuredPlanBody}`);
  });

  test('leaves non-plan prompts untouched', () => {
    const parts = [
      { id: 'msg_assistant_text', type: 'text', text: structuredPlanBody },
    ];
    expect(normalizePlanModeAssistantParts(parts, { isPlanModePrompt: false })).toEqual(parts);
  });
});

describe('plan mode prompt prefix', () => {
  test('matches the shared UI contract', () => {
    expect(PLAN_MODE_INSTRUCTION_PREFIX).toBe('User has requested to enter plan mode');
  });
});
