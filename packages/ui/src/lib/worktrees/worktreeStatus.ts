import { getGitStatus } from '@/lib/gitApi';
import { execCommand } from '@/lib/execCommands';
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

const toAbsolutePath = (baseDir: string, maybeRelativePath: string): string => {
  const normalizedBase = normalizePath(baseDir);
  const normalizedInput = normalizePath(maybeRelativePath);
  if (!normalizedInput) return normalizedBase;
  if (normalizedInput.startsWith('/')) return normalizedInput;

  const stack = normalizedBase.split('/').filter(Boolean);
  const parts = normalizedInput.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join('/')}`;
};

const derivePrimaryWorktreeRootFromGitDir = (gitDir: string): string | null => {
  const normalized = normalizePath(gitDir);
  if (!normalized) return null;
  if (normalized.endsWith('/.git')) {
    return normalized.slice(0, -'/.git'.length) || null;
  }
  const worktreesMarker = '/.git/worktrees/';
  const markerIndex = normalized.indexOf(worktreesMarker);
  if (markerIndex > 0) {
    return normalized.slice(0, markerIndex) || null;
  }
  return null;
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

const parseCombinedRevParseOutput = (
  stdout: string,
): { absoluteGitDir: string; gitCommonDir: string } | null => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  return {
    absoluteGitDir: lines[0],
    gitCommonDir: lines[1],
  };
};

const derivePrimaryRootFromGitDirs = (
  directory: string,
  absoluteGitDir: string,
  gitCommonDir: string,
): string | null => {
  const rootFromAbsoluteGitDir = derivePrimaryWorktreeRootFromGitDir(absoluteGitDir);
  if (rootFromAbsoluteGitDir) {
    return rootFromAbsoluteGitDir;
  }

  const commonDir = toAbsolutePath(directory, gitCommonDir);
  return derivePrimaryWorktreeRootFromGitDir(commonDir);
};

const resolvePrimaryWorktreeRootUncached = async (directory: string): Promise<string> => {
  const combinedResult = await execCommand('git rev-parse --absolute-git-dir --git-common-dir', directory);
  const combined = combinedResult.success
    ? parseCombinedRevParseOutput(combinedResult.stdout || '')
    : null;
  if (combined) {
    const combinedRoot = derivePrimaryRootFromGitDirs(
      directory,
      combined.absoluteGitDir,
      combined.gitCommonDir,
    );
    if (combinedRoot) {
      return combinedRoot;
    }
  }

  const absoluteGitDirResult = await execCommand('git rev-parse --absolute-git-dir', directory);
  const absoluteGitDir = normalizePath((absoluteGitDirResult.stdout || '').trim());
  if (absoluteGitDirResult.success && absoluteGitDir) {
    const rootFromAbsoluteGitDir = derivePrimaryWorktreeRootFromGitDir(absoluteGitDir);
    if (rootFromAbsoluteGitDir) {
      return rootFromAbsoluteGitDir;
    }
  }

  const commonDirResult = await execCommand('git rev-parse --git-common-dir', directory);
  const rawCommonDir = normalizePath((commonDirResult.stdout || '').trim());
  if (!commonDirResult.success || !rawCommonDir) return directory;

  const commonDir = toAbsolutePath(directory, rawCommonDir);
  const rootFromCommonDir = derivePrimaryWorktreeRootFromGitDir(commonDir);
  if (rootFromCommonDir) {
    return rootFromCommonDir;
  }

  return directory;
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
