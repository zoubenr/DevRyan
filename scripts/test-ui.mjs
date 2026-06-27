#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { discoverTestFiles, isIsolatedUiTestSource } from './test-runner-utils.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = path.join(repositoryRoot, 'packages/ui');
const explicitFiles = process.argv.slice(2);

function requiresIsolatedProcess(relativePath) {
  const source = readFileSync(path.join(uiRoot, relativePath), 'utf8');
  return isIsolatedUiTestSource(source);
}

function runBunTest(files) {
  console.log(`\n$ bun test ${files.join(' ')}`);
  const result = spawnSync('bun', ['test', ...files], {
    cwd: uiRoot,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

const files = explicitFiles.length > 0
  ? explicitFiles.map((file) => file.split(path.sep).join('/'))
  : discoverTestFiles(path.join(uiRoot, 'src'), uiRoot);

if (files.length === 0) {
  console.log('No UI test files matched.');
  process.exit(0);
}

// Files using mock.module or mutating global window state must run in isolated processes.
// All other UI tests run in one Bun process to reduce spawn overhead.
const isolatedFiles = [];
const batchableFiles = [];

for (const file of files) {
  if (requiresIsolatedProcess(file)) isolatedFiles.push(file);
  else batchableFiles.push(file);
}

for (const file of isolatedFiles) {
  const status = runBunTest([file]);
  if (status !== 0) process.exit(status);
}

if (batchableFiles.length > 0) {
  const status = runBunTest(batchableFiles);
  if (status !== 0) process.exit(status);
}
