import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createMagicPromptRuntime } from './runtime.js';

const tempDirs = [];

const createRuntime = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'devryan-magic-prompts-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'magic-prompts.json');
  return {
    filePath,
    runtime: createMagicPromptRuntime({
      fsPromises: { readFile, writeFile, mkdir },
      path,
      filePath,
    }),
  };
};

describe('magic prompt runtime deprecated commit prompt ids', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('filters deprecated commit prompt overrides when reading state', async () => {
    const { filePath, runtime } = await createRuntime();
    await writeFile(filePath, JSON.stringify({
      version: 1,
      overrides: {
        'git.commit.draft.visible': 'old draft visible',
        'git.commit.draft.instructions': 'old draft instructions',
        'git.commit.plan.visible': 'old plan visible',
        'git.commit.plan.instructions': 'old plan instructions',
        'git.commit.generate.visible': 'new commit visible',
        'git.pr.generate.visible': 'pr visible',
      },
    }), 'utf8');

    await expect(runtime.readPromptState()).resolves.toEqual({
      version: 1,
      overrides: {
        'git.commit.generate.visible': 'new commit visible',
        'git.pr.generate.visible': 'pr visible',
      },
    });
  });

  it('rejects new writes to deprecated commit prompt ids', async () => {
    const { runtime } = await createRuntime();

    await expect(runtime.setOverride('git.commit.draft.visible', 'old value'))
      .rejects.toThrow('Deprecated prompt id');
  });
});
