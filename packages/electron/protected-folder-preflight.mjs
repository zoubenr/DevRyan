import path from 'node:path';

const PROTECTED_FOLDER_NAMES = ['Documents', 'Desktop', 'Downloads'];
const ACCESS_DENIED_CODES = new Set(['EACCES', 'EPERM']);

const normalizeCandidatePath = (candidate) => {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
};

export const isInsideMacosProtectedFolder = (candidate, homeDirectory) => {
  const resolved = normalizeCandidatePath(candidate);
  const home = normalizeCandidatePath(homeDirectory);
  if (!resolved || !home) return false;

  for (const folderName of PROTECTED_FOLDER_NAMES) {
    const protectedRoot = path.join(home, folderName);
    const relative = path.relative(protectedRoot, resolved);
    if (relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))) {
      return true;
    }
  }

  return false;
};

const projectPathForId = (projects, activeProjectId) => {
  if (!Array.isArray(projects) || typeof activeProjectId !== 'string' || !activeProjectId) {
    return null;
  }
  const active = projects.find((project) => project?.id === activeProjectId);
  return normalizeCandidatePath(active?.path);
};

const firstProjectPath = (projects) => {
  if (!Array.isArray(projects)) return null;
  const first = projects.find((project) => typeof project?.path === 'string' && project.path.trim());
  return normalizeCandidatePath(first?.path);
};

export const findProtectedDirectoryCandidate = (settings, homeDirectory) => {
  const root = settings && typeof settings === 'object' ? settings : {};
  const candidates = [
    normalizeCandidatePath(root.lastDirectory),
    projectPathForId(root.projects, root.activeProjectId),
    firstProjectPath(root.projects),
  ];

  return candidates.find((candidate) => isInsideMacosProtectedFolder(candidate, homeDirectory)) || null;
};

export const preflightMacosProtectedDirectoryAccess = async ({
  platform = process.platform,
  homeDirectory,
  settings,
  fsPromises,
  log = console,
} = {}) => {
  if (platform !== 'darwin') {
    return { status: 'skipped', reason: 'platform' };
  }

  const candidate = findProtectedDirectoryCandidate(settings, homeDirectory);
  if (!candidate) {
    return { status: 'skipped', reason: 'no-protected-path' };
  }

  try {
    const stats = await fsPromises.stat(candidate);
    if (!stats.isDirectory()) {
      return { status: 'skipped', reason: 'not-directory', path: candidate };
    }
    log.info?.(`[electron] macOS protected-folder preflight succeeded for ${candidate}`);
    return { status: 'granted', path: candidate };
  } catch (error) {
    if (error && typeof error === 'object' && ACCESS_DENIED_CODES.has(error.code)) {
      log.warn?.(
        `[electron] macOS protected-folder preflight denied for ${candidate}; skipping managed OpenCode startup until access is granted.`,
      );
      return { status: 'denied', path: candidate, error };
    }

    log.warn?.(`[electron] macOS protected-folder preflight failed for ${candidate}:`, error);
    return { status: 'failed', path: candidate, error };
  }
};
