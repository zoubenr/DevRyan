import { describe, expect, test } from 'bun:test';
import type { ToolPart } from '@opencode-ai/sdk/v2';
import { isToolPartFinalizedForDisplay } from './toolDisplayState';

const toolPart = (status: string, time?: { start?: number; end?: number }): ToolPart => ({
  id: `tool-${status}`,
  type: 'tool',
  tool: 'write',
  messageID: 'message-1',
  state: {
    status,
    ...(time ? { time } : {}),
  },
} as ToolPart);

describe('isToolPartFinalizedForDisplay', () => {
  test('treats terminal statuses as finalized without requiring an end time', () => {
    expect(isToolPartFinalizedForDisplay(toolPart('completed'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('complete'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('done'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('error'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('failed'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('aborted'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('timeout'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('timed_out'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('cancelled'))).toBe(true);
    expect(isToolPartFinalizedForDisplay(toolPart('canceled'))).toBe(true);
  });

  test('does not treat active statuses as finalized', () => {
    expect(isToolPartFinalizedForDisplay(toolPart('pending'))).toBe(false);
    expect(isToolPartFinalizedForDisplay(toolPart('running'))).toBe(false);
    expect(isToolPartFinalizedForDisplay(toolPart('started'))).toBe(false);
  });

  test('rejects impossible time ranges even for otherwise terminal parts', () => {
    expect(isToolPartFinalizedForDisplay(toolPart('completed', { start: 20, end: 10 }))).toBe(false);
  });
});
