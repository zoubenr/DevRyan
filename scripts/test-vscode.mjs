#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { discoverTestFiles } from './test-runner-utils.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vscodeRoot = path.join(repositoryRoot, 'packages/vscode');

export function discoverVscodeBunTestFiles(root) {
  const testsRoot = path.join(root, 'tests');
  if (!existsSync(testsRoot)) return [];
  return discoverTestFiles(testsRoot, root, {
    pattern: /(?:^|[./-])test\.[cm]?[jt]sx?$/,
  });
}

export function buildVscodeTestSteps(root) {
  const bunTestFiles = discoverVscodeBunTestFiles(root);
  const steps = [{
    label: 'vitest run',
    command: ['bunx', 'vitest', 'run', '--config', 'vitest.config.mjs'],
    cwd: root,
  }];

  if (bunTestFiles.length > 0) {
    steps.push({
      label: 'bun test vscode tests',
      command: ['bun', 'test', ...bunTestFiles],
      cwd: root,
    });
  }

  return steps;
}

export function runSteps(steps) {
  for (const step of steps) {
    console.log(`\n$ ${step.command.join(' ')}`);
    const result = spawnSync(step.command[0], step.command.slice(1), {
      cwd: step.cwd,
      stdio: 'inherit',
      env: process.env,
    });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSteps(buildVscodeTestSteps(vscodeRoot));
}
