import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, access } from 'fs/promises';

import { registerFsRoutes } from './routes.js';

const createApp = ({ workspace, configRoot, spawn = vi.fn() }) => {
  const app = express();
  app.use(express.json());
  registerFsRoutes(app, {
    os,
    path,
    fsPromises: fs.promises,
    spawn,
    crypto: { randomUUID: () => 'test-job-id' },
    normalizeDirectoryPath: (value) => value,
    resolveProjectDirectory: async () => ({ directory: workspace }),
    buildAugmentedPath: () => process.env.PATH || '',
    resolveGitBinaryForSpawn: () => 'git',
    openchamberUserConfigRoot: configRoot,
  });
  return app;
};

describe('fs mutation routes', () => {
  let workspace = '';
  let outsideDir = '';
  let configRoot = '';
  let cleanup = [];

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'devryan-fs-workspace-'));
    outsideDir = await mkdtemp(path.join(os.tmpdir(), 'devryan-fs-outside-'));
    configRoot = await mkdtemp(path.join(os.tmpdir(), 'devryan-fs-config-'));
    cleanup = [workspace, outsideDir, configRoot];
  });

  afterEach(async () => {
    await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('rejects default mkdir outside the workspace', async () => {
    const target = path.join(outsideDir, 'nested');
    const response = await request(createApp({ workspace, configRoot }))
      .post('/api/fs/mkdir')
      .send({ path: target });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/outside of active workspace/i);
    await expect(access(target)).rejects.toThrow();
  });

  it('rejects default mkdir through a workspace symlink to outside', async () => {
    const linkPath = path.join(workspace, 'escape-link');
    await symlink(outsideDir, linkPath);
    const target = path.join(linkPath, 'nested');

    const response = await request(createApp({ workspace, configRoot }))
      .post('/api/fs/mkdir')
      .send({ path: target });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Access denied');
    await expect(access(target)).rejects.toThrow();
  });

  it('allows allowOutsideWorkspace mkdir for direct outside paths', async () => {
    const target = path.join(outsideDir, 'allowed-outside');
    const response = await request(createApp({ workspace, configRoot }))
      .post('/api/fs/mkdir')
      .send({ path: target, allowOutsideWorkspace: true });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const canonicalTarget = await fs.promises.realpath(target);
    expect(response.body.path).toBe(canonicalTarget);
    const stat = await fs.promises.stat(canonicalTarget);
    expect(stat.isDirectory()).toBe(true);
  });

  it('rejects allowOutsideWorkspace mkdir through workspace symlink prefixes', async () => {
    const linkPath = path.join(workspace, 'escape-link');
    await symlink(outsideDir, linkPath);
    const target = path.join(linkPath, 'blocked-outside');

    const response = await request(createApp({ workspace, configRoot }))
      .post('/api/fs/mkdir')
      .send({ path: target, allowOutsideWorkspace: true });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Symlink paths are not allowed');
    await expect(access(target)).rejects.toThrow();
  });

  it('rejects write/delete/rename through workspace symlinks without mutating outside files', async () => {
    const outsideFile = path.join(outsideDir, 'victim.txt');
    await writeFile(outsideFile, 'untouched', 'utf8');

    const linkDir = path.join(workspace, 'link-dir');
    await symlink(outsideDir, linkDir);

    const writeTarget = path.join(linkDir, 'written.txt');
    const deleteTarget = path.join(linkDir, 'victim.txt');
    const renameOld = path.join(linkDir, 'victim.txt');
    const renameNew = path.join(linkDir, 'renamed.txt');

    const app = createApp({ workspace, configRoot });

    const writeResponse = await request(app)
      .post('/api/fs/write')
      .send({ path: writeTarget, content: 'escaped' });
    expect(writeResponse.status).toBe(403);

    const deleteResponse = await request(app)
      .post('/api/fs/delete')
      .send({ path: deleteTarget });
    expect(deleteResponse.status).toBe(403);

    const renameResponse = await request(app)
      .post('/api/fs/rename')
      .send({ oldPath: renameOld, newPath: renameNew });
    expect(renameResponse.status).toBe(403);

    expect(await readFile(outsideFile, 'utf8')).toBe('untouched');
    await expect(access(writeTarget)).rejects.toThrow();
    await expect(access(renameNew)).rejects.toThrow();
  });

  it('rejects exec cwd through workspace symlinks before spawning', async () => {
    const linkPath = path.join(workspace, 'exec-link');
    await symlink(outsideDir, linkPath);
    const spawn = vi.fn();

    const response = await request(createApp({ workspace, configRoot, spawn }))
      .post('/api/fs/exec')
      .send({ cwd: linkPath, commands: ['echo hi'] });

    expect(response.status).toBe(403);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('allows config-root mutation', async () => {
    await mkdir(configRoot, { recursive: true });
    const configFile = path.join(configRoot, 'settings.json');
    const content = '{"enabled":true}';

    const response = await request(createApp({ workspace, configRoot }))
      .post('/api/fs/write')
      .send({ path: configFile, content });

    expect(response.status).toBe(200);
    expect(await readFile(configFile, 'utf8')).toBe(content);
  });
});
