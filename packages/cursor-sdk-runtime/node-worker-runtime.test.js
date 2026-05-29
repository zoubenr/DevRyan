import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  createCursorSdkRuntime,
  resolveCursorSdkWorkerRuntimeConfig,
} from './index.js';

let tempDir = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

const createFakeWorkerSpawn = (capture) => (command, args, options) => {
  const child = new EventEmitter();
  let rawInput = '';

  capture.calls.push({ command, args, options });
  child.exitCode = null;
  child.killed = false;
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      rawInput += chunk.toString();
      callback();
    },
    final(callback) {
      capture.input = JSON.parse(rawInput);
      queueMicrotask(() => {
        child.stdout.push(`${JSON.stringify({
          type: 'message',
          message: {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'worker ok' }] },
          },
        })}\n`);
        child.stdout.push(`${JSON.stringify({ type: 'done', status: 'finished' })}\n`);
        child.stdout.push(null);
        child.exitCode = 0;
        child.emit('close', 0, null);
      });
      callback();
    },
  });
  child.kill = (signal) => {
    child.killed = true;
    child.exitCode = signal === 'SIGKILL' ? 137 : 130;
    queueMicrotask(() => child.emit('close', child.exitCode, signal));
    return true;
  };

  return child;
};

describe('Cursor SDK worker runtime config', () => {
  test('runs desktop Electron prompt work in an Electron-as-Node worker', () => {
    const config = resolveCursorSdkWorkerRuntimeConfig({
      env: { OPENCHAMBER_RUNTIME: 'desktop' },
      hasInjectedLoadSdk: false,
      isBunRuntime: false,
      isElectronRuntime: true,
      execPath: '/Applications/DevRyan.app/Contents/MacOS/DevRyan',
      resourcesPath: '/Applications/DevRyan.app/Contents/Resources',
      nodeBinaryEnv: '',
      requestedNodeBinary: '',
      requestedUseNodeWorkerForPrompts: undefined,
      requestedWorkerCwd: '',
      requestedWorkerEnv: {},
      workerPath: '/Applications/DevRyan.app/Contents/Resources/app.asar/node_modules/@openchamber/cursor-sdk-runtime/node-worker.mjs',
    });

    expect(config.useNodeWorkerForPrompts).toBe(true);
    expect(config.nodeBinary).toBe('/Applications/DevRyan.app/Contents/MacOS/DevRyan');
    expect(config.workerCwd).toBe('/Applications/DevRyan.app/Contents/Resources');
    expect(config.workerEnv).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
  });

  test('passes configured worker process settings to spawned prompt workers', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-worker-'));
    const capture = { calls: [], input: null };
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: { OPENCHAMBER_RUNTIME: 'desktop' },
      useNodeWorkerForPrompts: true,
      nodeBinary: '/Applications/DevRyan.app/Contents/MacOS/DevRyan',
      workerPath: '/Applications/DevRyan.app/Contents/Resources/app.asar/node_modules/@openchamber/cursor-sdk-runtime/node-worker.mjs',
      workerCwd: '/Applications/DevRyan.app/Contents/Resources',
      workerEnv: { ELECTRON_RUN_AS_NODE: '1' },
      spawnImpl: createFakeWorkerSpawn(capture),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_worker',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_worker_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0].command).toBe('/Applications/DevRyan.app/Contents/MacOS/DevRyan');
    expect(capture.calls[0].args).toEqual([
      '/Applications/DevRyan.app/Contents/Resources/app.asar/node_modules/@openchamber/cursor-sdk-runtime/node-worker.mjs',
    ]);
    expect(capture.calls[0].options.cwd).toBe('/Applications/DevRyan.app/Contents/Resources');
    expect(capture.calls[0].options.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(capture.input.modelSelection).toEqual({ id: 'composer-2.5' });
  });
});
