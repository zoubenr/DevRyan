import crypto from 'node:crypto';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createProjectIdFromPath } from '../projects/project-id.js';
import { createSettingsRuntime } from './settings-runtime.js';

const createRuntime = (initialSettings) => {
  const settingsPath = '/tmp/openchamber/settings.json';
  const writtenFiles = new Map();
  let settings = { ...initialSettings };

  const fsPromises = {
    readFile: vi.fn(async (filePath) => {
      if (filePath === settingsPath) {
        return JSON.stringify(settings);
      }
      const value = writtenFiles.get(filePath);
      if (typeof value === 'string') {
        return value;
      }
      const error = new Error('missing file');
      error.code = 'ENOENT';
      throw error;
    }),
    writeFile: vi.fn(async (filePath, value) => {
      writtenFiles.set(filePath, value);
    }),
    rename: vi.fn(async (from, to) => {
      const value = writtenFiles.get(from);
      writtenFiles.delete(from);
      writtenFiles.set(to, value);
      if (to === settingsPath) {
        settings = JSON.parse(value);
      }
    }),
    mkdir: vi.fn(async () => {}),
    readdir: vi.fn(async () => {
      const error = new Error('missing directory');
      error.code = 'ENOENT';
      throw error;
    }),
    access: vi.fn(async () => {
      const error = new Error('missing file');
      error.code = 'ENOENT';
      throw error;
    }),
    rm: vi.fn(async () => {}),
    stat: vi.fn(async () => {
      const error = new Error('operation not permitted');
      error.code = 'EPERM';
      throw error;
    }),
  };

  const runtime = createSettingsRuntime({
    fsPromises,
    path,
    crypto,
    SETTINGS_FILE_PATH: settingsPath,
    sanitizeProjects: (projects) => Array.isArray(projects) ? projects : undefined,
    sanitizeSettingsUpdate: (changes) => changes && typeof changes === 'object' ? { ...changes } : {},
    mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
    normalizeSettingsPaths: (value) => ({ settings: value, changed: false }),
    normalizeStringArray: (value) => Array.isArray(value) ? value : [],
    formatSettingsResponse: (value) => value,
    resolveDirectoryCandidate: (value) => value,
    normalizeManagedRemoteTunnelHostname: (value) => value,
    normalizeManagedRemoteTunnelPresets: (value) => value,
    normalizeManagedRemoteTunnelPresetTokens: (value) => value,
    syncManagedRemoteTunnelConfigWithPresets: vi.fn(async () => {}),
    upsertManagedRemoteTunnelToken: vi.fn(async () => {}),
  });

  return { runtime, fsPromises };
};

describe('settings runtime', () => {
  it('migrates legacy lastDirectory without statting the protected path', async () => {
    const projectPath = '/Users/test/Documents/LegacyProject';
    const projectId = createProjectIdFromPath(projectPath);
    const { runtime, fsPromises } = createRuntime({ lastDirectory: projectPath });

    const updated = await runtime.readSettingsFromDiskMigrated();

    expect(updated.projects).toEqual([
      {
        id: projectId,
        path: projectPath,
        addedAt: expect.any(Number),
        lastOpenedAt: expect.any(Number),
      },
    ]);
    expect(updated.activeProjectId).toBe(projectId);
    expect(fsPromises.stat).not.toHaveBeenCalled();
  });

  it('does not stat existing project paths when saving unrelated settings', async () => {
    const projectPath = '/Users/test/Documents/ProtectedProject';
    const projectId = createProjectIdFromPath(projectPath);
    const { runtime, fsPromises } = createRuntime({
      projects: [{ id: projectId, path: projectPath, addedAt: 1, lastOpenedAt: 1 }],
      activeProjectId: projectId,
    });

    const updated = await runtime.persistSettings({ themeId: 'dark-default' });

    expect(updated.projects).toEqual([{ id: projectId, path: projectPath, addedAt: 1, lastOpenedAt: 1 }]);
    expect(updated.themeId).toBe('dark-default');
    expect(fsPromises.stat).not.toHaveBeenCalled();
  });
});
