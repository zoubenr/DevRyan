import { describe, expect, test } from 'bun:test';

import { createContentCacheFilesAPI } from './runtimeFileCache';
import type { FilesAPI } from '@/lib/api/types';

describe('createContentCacheFilesAPI', () => {
  test('keeps cached reads separate by directory and validates with the same options', async () => {
    const reads: Array<{ path: string; directory?: string }> = [];
    const stats: Array<{ path: string; directory?: string }> = [];
    const files: FilesAPI = {
      listDirectory: async () => ({ directory: '', entries: [] }),
      search: async () => [],
      createDirectory: async (path) => ({ success: true, path }),
      statFile: async (path, options) => {
        stats.push({ path, directory: options?.directory });
        return { path, exists: true, isFile: true, size: 1, mtimeMs: 1 };
      },
      readFile: async (path, options) => {
        reads.push({ path, directory: options?.directory });
        return { path, content: options?.directory === '/worktree-a' ? 'a' : 'b' };
      },
    };

    const cached = createContentCacheFilesAPI(files);

    expect(await cached.readFile?.('/shared/file.txt', { directory: '/worktree-a' })).toEqual({
      path: '/shared/file.txt',
      content: 'a',
    });
    expect(await cached.readFile?.('/shared/file.txt', { directory: '/worktree-b' })).toEqual({
      path: '/shared/file.txt',
      content: 'b',
    });
    expect(await cached.readFile?.('/shared/file.txt', { directory: '/worktree-a' })).toEqual({
      path: '/shared/file.txt',
      content: 'a',
    });

    expect(reads).toEqual([
      { path: '/shared/file.txt', directory: '/worktree-a' },
      { path: '/shared/file.txt', directory: '/worktree-b' },
    ]);
    expect(stats.at(-1)).toEqual({ path: '/shared/file.txt', directory: '/worktree-a' });
  });
});
