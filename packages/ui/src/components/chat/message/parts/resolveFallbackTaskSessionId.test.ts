import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';

import { resolveTaskSessionIdFromChildren } from './resolveFallbackTaskSessionId';

const parentSessionId = 'parent';

const child = (id: string, created: number, agent: string | undefined = 'explorer'): Session => ({
  id,
  slug: id,
  projectID: 'project',
  directory: '/repo',
  title: id,
  time: { created, updated: created },
  parentID: parentSessionId,
  agent,
} as Session);

describe('resolveTaskSessionIdFromChildren', () => {
  test('returns explicit session id when provided', () => {
    const result = resolveTaskSessionIdFromChildren({
      explicitSessionId: 'explicit',
      parentSessionId,
      childSessions: [],
    });
    expect(result).toBe('explicit');
  });

  test('returns undefined when parent session is missing', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId: undefined,
      childSessions: [child('a', 100)],
      subagentType: 'explorer',
    });
    expect(result).toBe(undefined);
  });

  test('rejects single same-agent child created before taskStartTime', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('old', 100)],
      subagentType: 'explorer',
      taskStartTime: 500,
    });
    expect(result).toBe(undefined);
  });

  test('returns single same-agent child created at or after taskStartTime', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('new', 500)],
      subagentType: 'explorer',
      taskStartTime: 500,
    });
    expect(result).toBe('new');
  });

  test('disambiguates two same-agent children by time window', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('old', 100), child('new', 800)],
      subagentType: 'explorer',
      taskStartTime: 500,
    });
    expect(result).toBe('new');
  });

  test('returns undefined when subagent type does not match any child', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('a', 600, 'fixer')],
      subagentType: 'explorer',
      taskStartTime: 500,
    });
    expect(result).toBe(undefined);
  });

  test('without subagent type, rejects single candidate before taskStartTime', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('old', 100, 'explorer')],
      taskStartTime: 500,
    });
    expect(result).toBe(undefined);
  });

  test('without subagent type, returns single candidate within window', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('a', 600, 'explorer')],
      taskStartTime: 500,
    });
    expect(result).toBe('a');
  });

  test('with no taskStartTime, single same-agent match is still returned', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('a', 100)],
      subagentType: 'explorer',
    });
    expect(result).toBe('a');
  });

  test('with no taskStartTime and multiple matches, returns undefined', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('a', 100), child('b', 200)],
      subagentType: 'explorer',
    });
    expect(result).toBe(undefined);
  });

  test('respects taskEndTime upper bound', () => {
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [child('late', 900)],
      subagentType: 'explorer',
      taskStartTime: 100,
      taskEndTime: 500,
    });
    expect(result).toBe(undefined);
  });

  test('ignores sessions with different parentID', () => {
    const orphan: Session = { ...child('orphan', 600), parentID: 'other-parent' } as Session;
    const result = resolveTaskSessionIdFromChildren({
      parentSessionId,
      childSessions: [orphan],
      subagentType: 'explorer',
      taskStartTime: 500,
    });
    expect(result).toBe(undefined);
  });
});
