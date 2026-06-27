#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(__dirname, '..');
const sourceDir = path.join(electronDir, 'native', 'macos-speech');
const outputDir = path.join(electronDir, 'resources', 'native');
const sourceFile = path.join(sourceDir, 'MacosSpeechHelper.swift');
const infoPlist = path.join(sourceDir, 'Info.plist');
const outputFile = path.join(outputDir, 'macos-speech-helper');

await fs.mkdir(outputDir, { recursive: true });

if (process.platform !== 'darwin') {
  console.log('[electron] skipping macOS speech helper build on non-macOS host');
  process.exit(0);
}

const result = spawnSync('xcrun', [
  'swiftc',
  sourceFile,
  '-O',
  '-framework', 'Speech',
  '-framework', 'AVFoundation',
  '-Xlinker', '-sectcreate',
  '-Xlinker', '__TEXT',
  '-Xlinker', '__info_plist',
  '-Xlinker', infoPlist,
  '-o', outputFile,
], { stdio: 'inherit' });

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(`swiftc failed with exit code ${result.status}`);
}

await fs.chmod(outputFile, 0o755);
console.log(`[electron] macOS speech helper built -> ${outputFile}`);
