import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createProjectDirectoryRuntime } from './project-directory-runtime.js';

const createRuntime = (overrides = {}) => {
  const fsPromises = {
    stat: vi.fn(async () => ({ isDirectory: () => true })),
    realpath: vi.fn(async (value) => value),
    ...overrides.fsPromises,
  };

  return {
    fsPromises,
    runtime: createProjectDirectoryRuntime({
      fsPromises,
      path,
      normalizeDirectoryPath: (value) => value,
      readSettingsFromDiskMigrated: async () => ({}),
      getReadSettingsFromDiskMigrated: undefined,
      sanitizeProjects: (projects) => projects,
      ...overrides.dependencies,
    }),
  };
};

describe('createProjectDirectoryRuntime', () => {
  it('canonicalizes validated directories to their filesystem realpath', async () => {
    const aliasPath = path.join(path.sep, 'tmp', 'devryan-project');
    const canonicalPath = path.join(path.sep, 'private', 'tmp', 'devryan-project');
    const { fsPromises, runtime } = createRuntime({
      fsPromises: {
        realpath: vi.fn(async () => canonicalPath),
      },
    });

    const result = await runtime.validateDirectoryPath(aliasPath);

    expect(result).toEqual({ ok: true, directory: canonicalPath });
    expect(fsPromises.stat).toHaveBeenCalledWith(path.resolve(aliasPath));
    expect(fsPromises.realpath).toHaveBeenCalledWith(path.resolve(aliasPath));
  });

  it('resolves header directories through the same canonical validation path', async () => {
    const aliasPath = path.join(path.sep, 'tmp', 'devryan-project');
    const canonicalPath = path.join(path.sep, 'private', 'tmp', 'devryan-project');
    const { runtime } = createRuntime({
      fsPromises: {
        realpath: vi.fn(async () => canonicalPath),
      },
    });

    const result = await runtime.resolveProjectDirectory({
      get: (name) => (name === 'x-opencode-directory' ? aliasPath : null),
      query: {},
    });

    expect(result).toEqual({ directory: canonicalPath, error: null });
  });
});
