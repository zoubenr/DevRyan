import { getGitStatus, getPrimaryWorktreeRoot } from '@/lib/gitApi';
import type { WorktreeMetadata } from '@/types/worktree';

type RootBranchOptions = {
  knownBranch?: string | null;
  force?: boolean;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const WORKTREE_ROOT_CACHE_TTL_MS = 60_000;
const WORKTREE_CACHE_MAX_ENTRIES = 200;

const primaryRootCache = new Map<string, CacheEntry<string>>();
const primaryRootInflight = new Map<string, Promise<string>>();
const rootBranchCache = new Map<string, CacheEntry<string>>();
const rootBranchInflight = new Map<string, Promise<string>>();

const normalizePath = (value: string): string => {
  if (!value) {
    return '';
  }
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') {
    return '/';
  }
  return replaced.replace(/\/+$/, '');
};

const getCachedValue = <T>(cache: Map<string, CacheEntry<T>>, key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
};

const setCachedValue = <T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void => {
  cache.delete(key);
  cache.set(key, {
    value,
    expiresAt: Date.now() + WORKTREE_ROOT_CACHE_TTL_MS,
  });

  while (cache.size > WORKTREE_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== 'string') break;
    cache.delete(oldest);
  }
};

const resolvePrimaryWorktreeRootUncached = async (directory: string): Promise<string> => {
  try {
    const root = normalizePath(await getPrimaryWorktreeRoot(directory));
    return root || directory;
  } catch {
    return directory;
  }
};

export const resolvePrimaryWorktreeRoot = async (
  projectDirectory: string,
  options?: { force?: boolean },
): Promise<string> => {
  const normalizedPath = normalizePath(projectDirectory);
  if (!normalizedPath) return '';
  if (!options?.force) {
    const cached = getCachedValue(primaryRootCache, normalizedPath);
    if (cached) return cached;

    const inflight = primaryRootInflight.get(normalizedPath);
    if (inflight) return inflight;
  }

  const promise = resolvePrimaryWorktreeRootUncached(normalizedPath)
    .then((root) => {
      setCachedValue(primaryRootCache, normalizedPath, root);
      return root;
    })
    .finally(() => {
      primaryRootInflight.delete(normalizedPath);
    });

  if (!options?.force) {
    primaryRootInflight.set(normalizedPath, promise);
  }
  return promise;
};

export const invalidateRootBranchCache = (directory?: string): void => {
  if (!directory) {
    primaryRootCache.clear();
    primaryRootInflight.clear();
    rootBranchCache.clear();
    rootBranchInflight.clear();
    return;
  }

  const normalizedDirectory = normalizePath(directory);
  primaryRootCache.delete(normalizedDirectory);
  primaryRootInflight.delete(normalizedDirectory);
  rootBranchCache.delete(normalizedDirectory);
  rootBranchInflight.delete(normalizedDirectory);

  for (const [key, entry] of primaryRootCache.entries()) {
    if (entry.value === normalizedDirectory) {
      primaryRootCache.delete(key);
    }
  }
};

export async function getWorktreeStatus(worktreePath: string): Promise<WorktreeMetadata['status']> {
  const normalizedPath = normalizePath(worktreePath);
  const status = await getGitStatus(normalizedPath);
  return {
    isDirty: !status.isClean,
    ahead: status.ahead,
    behind: status.behind,
    upstream: status.tracking,
  };
}

export async function getRootBranch(projectDirectory: string, options?: RootBranchOptions): Promise<string> {
  const normalizedPath = normalizePath(projectDirectory);
  if (!normalizedPath) {
    return 'HEAD';
  }

  try {
    const projectRoot = await resolvePrimaryWorktreeRoot(normalizedPath, { force: options?.force }).catch(() => normalizedPath);
    const knownBranch = typeof options?.knownBranch === 'string' ? options.knownBranch.trim() : '';
    if (!options?.force && knownBranch && projectRoot === normalizedPath) {
      setCachedValue(rootBranchCache, projectRoot, knownBranch);
      return knownBranch;
    }

    if (!options?.force) {
      const cachedBranch = getCachedValue(rootBranchCache, projectRoot);
      if (cachedBranch) return cachedBranch;

      const inflight = rootBranchInflight.get(projectRoot);
      if (inflight) return inflight;
    }

    const promise = getGitStatus(projectRoot)
      .then((status) => {
        const branch = typeof status.current === 'string' ? status.current.trim() : '';
        const resolvedBranch = branch || 'HEAD';
        setCachedValue(rootBranchCache, projectRoot, resolvedBranch);
        return resolvedBranch;
      })
      .finally(() => {
        rootBranchInflight.delete(projectRoot);
      });

    if (!options?.force) {
      rootBranchInflight.set(projectRoot, promise);
    }
    return promise;
  } catch {
    return 'HEAD';
  }
}
