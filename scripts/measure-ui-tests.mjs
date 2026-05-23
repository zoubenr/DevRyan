#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { discoverTestFiles, isIsolatedUiTestSource } from './test-runner-utils.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = path.join(repositoryRoot, 'packages/ui');

function requiresIsolatedProcess(relativePath) {
  const source = readFileSync(path.join(uiRoot, relativePath), 'utf8');
  return isIsolatedUiTestSource(source);
}

const limit = Number.parseInt(process.env.MEASURE_UI_TESTS_LIMIT ?? '0', 10);
const files = discoverTestFiles(path.join(uiRoot, 'src'), uiRoot);
const isolated = [];
const batchable = [];

for (const file of files) {
  if (requiresIsolatedProcess(file)) isolated.push(file);
  else batchable.push(file);
}

console.log(`UI test files: ${files.length}`);
console.log(`  isolated (mock.module or global window): ${isolated.length}`);
console.log(`  batchable: ${batchable.length}`);

const toMeasure = limit > 0 ? files.slice(0, limit) : files;
const timings = [];

for (const file of toMeasure) {
  const started = Date.now();
  const result = spawnSync('bun', ['test', file], {
    cwd: uiRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });
  const elapsedMs = Date.now() - started;
  timings.push({
    file,
    elapsedMs,
    status: result.status ?? 1,
    isolated: isolated.includes(file),
  });
  const label = result.status === 0 ? 'ok' : 'fail';
  console.log(`${elapsedMs.toString().padStart(6)}ms  [${label}]  ${file}`);
}

if (timings.length > 0) {
  const totalMs = timings.reduce((sum, entry) => sum + entry.elapsedMs, 0);
  const slowest = [...timings].sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 10);
  console.log(`\nMeasured ${timings.length} file(s), total ${totalMs}ms`);
  console.log('Slowest:');
  for (const entry of slowest) {
    console.log(`  ${entry.elapsedMs}ms  ${entry.file}`);
  }
}

if (limit > 0 && files.length > limit) {
  console.log(`\n(Set MEASURE_UI_TESTS_LIMIT=0 to measure all ${files.length} files.)`);
}
