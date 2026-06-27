import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2/client';

import {
  __testArchivedAssistantHydration,
  isSessionNotFoundHydrationError,
} from './useSidebarArchivedAssistantActivityHydration';

const session = (id: string, fields: Partial<Session> = {}): Session => ({
  id,
  time: {
    created: 1,
    updated: 1,
  },
  title: id,
  ...fields,
} as Session);

describe('sidebar hydration helpers', () => {
  test('dedupes archived assistant fetch candidates by directory and parent session', () => {
    const parent = session('ses_parent', { directory: '/repo' } as Partial<Session>);
    const archivedChildA = session('ses_child_a', {
      directory: '/repo',
      parentID: 'ses_parent',
      time: { created: 1, updated: 2, archived: 3 },
    } as Partial<Session>);
    const archivedChildB = session('ses_child_b', {
      directory: '/repo',
      parentID: 'ses_parent',
      time: { created: 1, updated: 4, archived: 5 },
    } as Partial<Session>);

    const candidates = __testArchivedAssistantHydration.collectCandidates({
      activeSessions: [parent],
      archivedSessions: [archivedChildA, archivedChildB],
      activityByParentSessionId: {},
      getCachedMessages: () => undefined,
      resolvedKeys: new Set(),
      inFlightKeys: new Set(),
    });

    expect(candidates.fetch).toHaveLength(1);
    expect(candidates.fetch[0]?.parentSessionId).toBe('ses_parent');
    expect(candidates.fetch[0]?.directory).toBe('/repo');
  });

  test('recognizes true missing-session errors for negative caching', () => {
    expect(isSessionNotFoundHydrationError(Object.assign(new Error('missing'), { name: 'NotFoundError' }))).toBe(true);
    expect(isSessionNotFoundHydrationError(Object.assign(new Error('missing'), { status: 404 }))).toBe(true);
    expect(isSessionNotFoundHydrationError({
      response: { status: 404 },
    })).toBe(true);
    expect(isSessionNotFoundHydrationError(new Error('Session not found: ses_1'))).toBe(true);
  });

  test('keeps transient errors retryable', () => {
    expect(isSessionNotFoundHydrationError(Object.assign(new Error('warming up'), { status: 503 }))).toBe(false);
    expect(isSessionNotFoundHydrationError(new TypeError('Failed to fetch'))).toBe(false);
  });
});
