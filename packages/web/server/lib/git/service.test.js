import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import simpleGit from 'simple-git';

import { commit, getLog, getRemotes, getStatus, resolveBaseRefForLog, stageFile, unstageFile } from './service.js';

const tempDirs = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('getRemotes', () => {
  it('returns an empty remote list for non-git directories without logging noise', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openchamber-non-git-'));
    tempDirs.push(directory);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getRemotes(directory)).resolves.toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('file staging', () => {
  const createRepo = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openchamber-git-service-'));
    tempDirs.push(directory);
    const git = simpleGit(directory);
    await git.init();
    await git.addConfig('user.name', 'DevRyan Test');
    await git.addConfig('user.email', 'devryan@example.com');
    await writeFile(join(directory, 'tracked.txt'), 'initial\n');
    await git.add('tracked.txt');
    await git.commit('initial commit');
    return { directory, git };
  };

  it('stages and unstages a modified file', async () => {
    const { directory } = await createRepo();
    await writeFile(join(directory, 'tracked.txt'), 'changed\n');

    await stageFile(directory, 'tracked.txt');
    let status = await getStatus(directory);
    expect(status.files).toContainEqual({ path: 'tracked.txt', index: 'M', working_dir: ' ' });

    await unstageFile(directory, 'tracked.txt');
    status = await getStatus(directory);
    expect(status.files).toContainEqual({ path: 'tracked.txt', index: ' ', working_dir: 'M' });
  });

  it('commits only staged files when stagedOnly is requested', async () => {
    const { directory, git } = await createRepo();
    await writeFile(join(directory, 'tracked.txt'), 'staged\n');
    await writeFile(join(directory, 'unstaged.txt'), 'untracked\n');

    await stageFile(directory, 'tracked.txt');
    await commit(directory, 'commit staged file', {
      files: ['tracked.txt'],
      stagedOnly: true,
    });

    const committedFiles = await git.raw(['show', '--name-only', '--format=', 'HEAD']);
    expect(committedFiles.trim().split('\n')).toEqual(['tracked.txt']);

    const status = await getStatus(directory);
    expect(status.files).toContainEqual({ path: 'unstaged.txt', index: '?', working_dir: '?' });
    expect(status.files.some((file) => file.path === 'tracked.txt')).toBe(false);
  });
});

describe('git log base ref resolution', () => {
  it('prefers a local base ref over origin when both exist', async () => {
    const checkedRefs = [];
    const result = await resolveBaseRefForLog('main', async (ref) => {
      checkedRefs.push(ref);
      return ref === 'refs/heads/main' || ref === 'refs/remotes/origin/main';
    });

    expect(result).toBe('main');
    expect(checkedRefs).toEqual(['refs/heads/main']);
  });

  it('falls back to origin base ref when the local ref is absent', async () => {
    const result = await resolveBaseRefForLog('main', async (ref) => ref === 'refs/remotes/origin/main');

    expect(result).toBe('origin/main');
  });

  it('uses a remote-only origin base for custom log ranges', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openchamber-git-log-'));
    tempDirs.push(directory);
    const git = simpleGit(directory);
    await git.init();
    await git.addConfig('user.name', 'DevRyan Test');
    await git.addConfig('user.email', 'devryan@example.com');
    await git.checkoutLocalBranch('main');
    await writeFile(join(directory, 'tracked.txt'), 'base\n');
    await git.add('tracked.txt');
    await git.commit('base commit');
    const baseHash = (await git.revparse(['HEAD'])).trim();
    await git.checkoutLocalBranch('feature');
    await writeFile(join(directory, 'tracked.txt'), 'base\nfeature\n');
    await git.add('tracked.txt');
    await git.commit('feature commit');
    await git.raw(['update-ref', 'refs/remotes/origin/main', baseHash]);
    await git.raw(['branch', '-D', 'main']);

    const log = await getLog(directory, { from: 'main', to: 'HEAD' });

    expect(log.all.map((entry) => entry.message)).toEqual(['feature commit']);
  });
});
