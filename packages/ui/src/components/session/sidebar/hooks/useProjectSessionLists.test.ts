import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';
import { collectProjectSessionsForDirectories } from './useProjectSessionLists';

const session = (id: string, directory?: string | null, parentID?: string): Session => ({
  id,
  title: id,
  time: { created: 1, updated: 1 },
  ...(directory !== undefined ? { directory } : {}),
  ...(parentID ? { parentID } : {}),
} as Session);

describe('collectProjectSessionsForDirectories', () => {
  test('includes no-directory child sessions under a visible project parent', () => {
    const parent = session('parent', '/repo');
    const child = session('child', undefined, parent.id);
    const unrelated = session('unrelated', '/other-repo');

    const result = collectProjectSessionsForDirectories([parent, child, unrelated], ['/repo']);

    expect(result.map((entry) => entry.id)).toEqual(['parent', 'child']);
  });

  test('does not include no-directory children whose parent is outside the project', () => {
    const outsideParent = session('outside-parent', '/other-repo');
    const child = session('child', undefined, outsideParent.id);

    const result = collectProjectSessionsForDirectories([outsideParent, child], ['/repo']);

    expect(result).toEqual([]);
  });
});
