import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';

const session = (id: string, directory: string, parentID?: string, archivedAt?: number): Session => ({
  id,
  title: id,
  time: {
    created: 1,
    updated: 2,
    ...(archivedAt ? { archived: archivedAt } : {}),
  },
  directory,
  ...(parentID ? { parentID } : {}),
} as unknown as Session);

describe('useGlobalSessionsStore snapshot helpers', () => {
  beforeEach(() => {
    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [],
      sessionsByDirectory: new Map(),
      hasLoaded: true,
      status: 'ready',
    });
  });

  test('archiveSessionSnapshots moves captured active sessions into archived sessions', () => {
    const parent = session('parent', '/repo');
    const child = session('child', '/repo', 'parent');
    const unrelated = session('unrelated', '/repo');

    useGlobalSessionsStore.getState().applySnapshot([parent, child, unrelated], []);

    useGlobalSessionsStore.getState().removeSessions(['parent', 'child']);
    useGlobalSessionsStore.getState().archiveSessionSnapshots([parent, child], 100);

    const state = useGlobalSessionsStore.getState();
    expect(state.activeSessions.map((item) => item.id)).toEqual(['unrelated']);
    expect(state.archivedSessions.map((item) => item.id)).toEqual(['parent', 'child']);
    expect(state.archivedSessions.map((item) => item.time?.archived)).toEqual([100, 100]);
    expect(state.sessionsByDirectory.get('/repo')?.map((item) => item.id)).toEqual(['unrelated']);
  });

  test('restoreSessions restores active and archived snapshots to their original buckets', () => {
    const active = session('active-failed', '/repo');
    const archived = session('archived-failed', '/repo', undefined, 50);

    useGlobalSessionsStore.getState().applySnapshot([], []);

    useGlobalSessionsStore.getState().restoreSessions([active, archived]);

    const state = useGlobalSessionsStore.getState();
    expect(state.activeSessions.map((item) => item.id)).toEqual(['active-failed']);
    expect(state.archivedSessions.map((item) => item.id)).toEqual(['archived-failed']);
    expect(state.sessionsByDirectory.get('/repo')?.map((item) => item.id)).toEqual(['active-failed']);
  });
});
