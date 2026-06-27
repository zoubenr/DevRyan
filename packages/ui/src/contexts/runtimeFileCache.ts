import type { FilesAPI } from '@/lib/api/types';
import {
  approxStringBytes,
  evictContentLru,
  removeContentBytes,
  setContentBytes,
  touchContent as touchContentLru,
} from '@/sync/content-cache';

const getContentCacheKey = (path: string, options?: Parameters<NonNullable<FilesAPI['readFile']>>[1]): string => {
  const directory = options?.directory ?? '';
  const outside = options?.allowOutsideWorkspace ? '1' : '0';
  return JSON.stringify([path, directory, outside]);
};

/** Wrap a FilesAPI with an in-memory LRU content cache. */
export function createContentCacheFilesAPI(files: FilesAPI): FilesAPI {
  const cache = new Map<string, { content: string; path: string; size?: number; mtimeMs?: number }>();

  /** Whether cached metadata still matches the file on disk. */
  const statMatches = (
    cached: { size?: number; mtimeMs?: number },
    latest: { isFile: boolean; size: number; mtimeMs?: number },
  ): boolean => {
    if (!latest.isFile) return false;
    // If mtimeMs is available on both sides, it is the strongest signal.
    if (cached.mtimeMs !== undefined && latest.mtimeMs !== undefined) {
      return cached.mtimeMs === latest.mtimeMs && cached.size === latest.size;
    }
    return cached.size === latest.size;
  };

  const syncCacheEntry = (
    cacheKey: string,
    result: { content: string; path: string },
    stat?: { isFile: boolean; size: number; mtimeMs?: number } | null,
  ): { content: string; path: string } => {
    const bytes = approxStringBytes(result.content);
    cache.set(cacheKey, {
      ...result,
      size: stat?.isFile ? stat.size : undefined,
      mtimeMs: stat?.isFile ? stat.mtimeMs : undefined,
    });
    setContentBytes(cacheKey, bytes);

    const keep = new Set<string>();
    evictContentLru(keep, (evictPath) => {
      cache.delete(evictPath);
    });

    return result;
  };

  const readFreshFile = async (path: string, options?: Parameters<NonNullable<FilesAPI['readFile']>>[1]): Promise<{ content: string; path: string }> => {
    const cacheKey = getContentCacheKey(path, options);
    // stat -> read -> stat to avoid TOCTOU:
    // if the file changes between read and either stat, metadata won't match and we retry.
    const statBefore = await files.statFile?.(path, options).catch(() => null);

    const result = await files.readFile!(path, options);

    const statAfter = await files.statFile?.(path, options).catch(() => null);

    // If both stats are available and agree, the read was atomic with respect to file changes.
    if (statBefore && statAfter && statBefore.isFile && statAfter.isFile) {
      if (statBefore.size === statAfter.size && statBefore.mtimeMs === statAfter.mtimeMs) {
        return syncCacheEntry(cacheKey, result, statAfter);
      }
      // File changed during read - discard and re-read once.
      const retryStatBefore = await files.statFile?.(path, options).catch(() => null);
      const retry = await files.readFile!(path, options);
      const retryStat = await files.statFile?.(path, options).catch(() => null);
      // Accept retry only if file was stable across the read.
      if (retryStatBefore && retryStat && retryStatBefore.isFile && retryStat.isFile
        && retryStatBefore.size === retryStat.size && retryStatBefore.mtimeMs === retryStat.mtimeMs) {
        return syncCacheEntry(cacheKey, retry, retryStat);
      }
      // Best-effort: file was still changing, cache what we got. Next hit will re-validate.
      return syncCacheEntry(cacheKey, retry, retryStat);
    }

    return syncCacheEntry(cacheKey, result, statAfter ?? statBefore);
  };

  const deleteCacheEntriesForPath = (path: string) => {
    for (const key of cache.keys()) {
      let cachedPath = '';
      try {
        const parsed = JSON.parse(key) as unknown[];
        cachedPath = typeof parsed[0] === 'string' ? parsed[0] : '';
      } catch {
        cachedPath = key;
      }
      if (cachedPath === path) {
        cache.delete(key);
        removeContentBytes(key);
      }
    }
  };

  const cachedReadFile: FilesAPI['readFile'] = files.readFile
    ? async (path: string, options) => {
        const cacheKey = getContentCacheKey(path, options);
        const hit = cache.get(cacheKey);
        if (hit) {
          // Validate cached entry is still fresh
          if (files.statFile) {
            const latest = await files.statFile(path, options).catch(() => null);
            if (latest && !statMatches(hit, latest)) {
              cache.delete(cacheKey);
              removeContentBytes(cacheKey);
              return readFreshFile(path, options);
            }
          }
          touchContentLru(cacheKey);
          return { content: hit.content, path: hit.path };
        }

        return readFreshFile(path, options);
      }
    : undefined;

  // Invalidate cache on writes, deletes, renames
  const cachedWriteFile: FilesAPI['writeFile'] = files.writeFile
    ? async (path, content) => {
        deleteCacheEntriesForPath(path);
        return files.writeFile!(path, content);
      }
    : undefined;

  const cachedDelete: FilesAPI['delete'] = files.delete
    ? async (path) => {
        deleteCacheEntriesForPath(path);
        return files.delete!(path);
      }
    : undefined;

  const cachedRename: FilesAPI['rename'] = files.rename
    ? async (oldPath, newPath) => {
        deleteCacheEntriesForPath(oldPath);
        deleteCacheEntriesForPath(newPath);
        return files.rename!(oldPath, newPath);
      }
    : undefined;

  return {
    ...files,
    readFile: cachedReadFile,
    writeFile: cachedWriteFile,
    delete: cachedDelete,
    rename: cachedRename,
  };
}
