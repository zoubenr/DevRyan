import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'fs/promises';

const vscodeFsMocks = vi.hoisted(() => ({
  createDirectory: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined,
    fs: vscodeFsMocks,
    findFiles: vi.fn(async () => []),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
  },
  window: {
    showOpenDialog: vi.fn(async () => undefined),
    showSaveDialog: vi.fn(async () => undefined),
  },
  Uri: {
    file: (value) => ({ fsPath: value, path: value }),
    joinPath: (base, name) => ({ fsPath: path.join(base.fsPath, name), path: path.join(base.fsPath, name) }),
    parse: (value) => ({ fsPath: value, path: value, scheme: 'file' }),
  },
  FileType: { Directory: 2, File: 1 },
  commands: { executeCommand: vi.fn(async () => {}) },
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

const { handleFsBridgeMessage } = await import('./bridge-fs-runtime');
const {
  resolveFileMutationPath,
  resolveExecCwdPath,
  resolveUserPath,
  listDirectoryEntries,
  normalizeFsPath,
  searchDirectory,
  resolveFileReadPath,
  parseDroppedFileReference,
  readUriAsAttachment,
} = await import('./bridge-fs-helpers-runtime');
const vscode = await import('vscode');

const createDeps = () => ({
  resolveUserPath,
  listDirectoryEntries,
  normalizeFsPath,
  execGit: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  searchDirectory: vi.fn(async () => []),
  resolveFileReadPath,
  resolveFileMutationPath,
  resolveExecCwdPath,
  parseDroppedFileReference,
  readUriAsAttachment: vi.fn(),
});

describe('handleFsBridgeMessage mutation safety', () => {
  let workspace = '';
  let outsideDir = '';
  let cleanup = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    workspace = await mkdtemp(path.join(os.tmpdir(), 'devryan-vscode-workspace-'));
    outsideDir = await mkdtemp(path.join(os.tmpdir(), 'devryan-vscode-outside-'));
    cleanup = [workspace, outsideDir];
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspace } }];
  });

  afterEach(async () => {
    await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('rejects write/delete/rename/exec with direct outside-root paths', async () => {
    const outsideFile = path.join(outsideDir, 'outside.txt');
    await writeFile(outsideFile, 'outside', 'utf8');
    const deps = createDeps();

    const writeResponse = await handleFsBridgeMessage(
      { id: '1', type: 'api:fs:write', payload: { path: outsideFile, content: 'nope' } },
      deps,
    );
    expect(writeResponse?.success).toBe(false);
    expect(writeResponse?.error).toMatch(/outside of active workspace/i);

    const deleteResponse = await handleFsBridgeMessage(
      { id: '2', type: 'api:fs:delete', payload: { path: outsideFile } },
      deps,
    );
    expect(deleteResponse?.success).toBe(false);

    const renameResponse = await handleFsBridgeMessage(
      {
        id: '3',
        type: 'api:fs:rename',
        payload: { oldPath: outsideFile, newPath: path.join(outsideDir, 'renamed.txt') },
      },
      deps,
    );
    expect(renameResponse?.success).toBe(false);

    const execResponse = await handleFsBridgeMessage(
      { id: '4', type: 'api:fs:exec', payload: { cwd: outsideDir, commands: ['echo hi'] } },
      deps,
    );
    expect(execResponse?.success).toBe(false);

    expect(vscodeFsMocks.writeFile).not.toHaveBeenCalled();
    expect(vscodeFsMocks.delete).not.toHaveBeenCalled();
    expect(vscodeFsMocks.rename).not.toHaveBeenCalled();

    const { exec } = await import('child_process');
    expect(exec).not.toHaveBeenCalled();
  });

  it('rejects write/mkdir through a workspace symlink parent', async () => {
    const linkPath = path.join(workspace, 'escape-link');
    await symlink(outsideDir, linkPath);
    const deps = createDeps();

    const writeResponse = await handleFsBridgeMessage(
      {
        id: '5',
        type: 'api:fs:write',
        payload: { path: path.join(linkPath, 'escaped.txt'), content: 'escaped' },
      },
      deps,
    );
    expect(writeResponse?.success).toBe(false);
    expect(writeResponse?.error).toBe('Access denied');

    const mkdirResponse = await handleFsBridgeMessage(
      {
        id: '6',
        type: 'api:fs:mkdir',
        payload: { path: path.join(linkPath, 'nested') },
      },
      deps,
    );
    expect(mkdirResponse?.success).toBe(false);
    expect(vscodeFsMocks.writeFile).not.toHaveBeenCalled();
    expect(vscodeFsMocks.createDirectory).not.toHaveBeenCalled();
  });

  it('rejects delete/rename when symlink target realpaths outside the workspace', async () => {
    const outsideFile = path.join(outsideDir, 'victim.txt');
    await writeFile(outsideFile, 'untouched', 'utf8');
    const linkFile = path.join(workspace, 'victim-link');
    await symlink(outsideFile, linkFile);
    const deps = createDeps();

    const deleteResponse = await handleFsBridgeMessage(
      { id: '7', type: 'api:fs:delete', payload: { path: linkFile } },
      deps,
    );
    expect(deleteResponse?.success).toBe(false);
    expect(deleteResponse?.error).toBe('Access denied');

    const renameResponse = await handleFsBridgeMessage(
      {
        id: '8',
        type: 'api:fs:rename',
        payload: {
          oldPath: linkFile,
          newPath: path.join(workspace, 'renamed.txt'),
        },
      },
      deps,
    );
    expect(renameResponse?.success).toBe(false);

    expect(vscodeFsMocks.delete).not.toHaveBeenCalled();
    expect(vscodeFsMocks.rename).not.toHaveBeenCalled();
    expect(await readFile(outsideFile, 'utf8')).toBe('untouched');
  });
});
