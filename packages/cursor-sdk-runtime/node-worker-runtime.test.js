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

const createFinalResultBeforeStreamWorkerSpawn = (capture) => (command, args, options) => {
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
          type: 'final-result',
          result: {
            ok: true,
            finalStatus: 'success',
            finalText: 'worker final text before stream completion',
          },
        })}\n`);
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
    expect(capture.input.modelSelection).toEqual({
      id: 'composer-2.5',
      params: [{ id: 'fast', value: 'false' }],
    });
  });

  test('applies worker final result while stdout stream remains open', async () => {
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
      spawnImpl: createFinalResultBeforeStreamWorkerSpawn(capture),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_worker_final',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_worker_final_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    let records = [];
    for (let index = 0; index < 25; index += 1) {
      records = await runtime.getSessionMessages('ses_worker_final');
      if (records.some((record) => record.info?.role === 'assistant' && record.info?.finish)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('worker final text before stream completion');
    expect(runtime.getRuntimeStatus().activeRuns).toBe(0);
  });

  test('passes data URL image attachments to prompt workers as Cursor data images', async () => {
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
      sessionID: 'ses_worker_image',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_worker_image_user',
        parts: [
          { type: 'text', text: 'describe this' },
          {
            type: 'file',
            mime: 'image/png',
            filename: 'sample.png',
            url: 'data:image/png;base64,aGVsbG8=',
          },
        ],
      },
    });

    expect(capture.input.images).toEqual([
      { data: 'aGVsbG8=', mimeType: 'image/png' },
    ]);
  });

  test('encodes non-base64 data URL image attachments for prompt workers', async () => {
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
      sessionID: 'ses_worker_plain_image',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_worker_plain_image_user',
        parts: [
          { type: 'text', text: 'describe this' },
          {
            type: 'file',
            mime: 'image/svg+xml',
            filename: 'sample.svg',
            url: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E',
          },
        ],
      },
    });

    expect(capture.input.images).toEqual([
      { data: 'PHN2Zz48L3N2Zz4=', mimeType: 'image/svg+xml' },
    ]);
  });

  test('direct Cursor SDK runs send data URL image attachments as Cursor data images', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-direct-'));
    let sentMessage = null;
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      useNodeWorkerForPrompts: false,
      loadSdk: async () => ({
        Agent: {
          create: async () => ({
            agentId: 'agent_direct_image',
            send: async (message) => {
              sentMessage = message;
              return {
                status: 'finished',
                stream: async function* stream() {},
                wait: async () => ({ status: 'finished', result: 'ok' }),
              };
            },
          }),
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_direct_image',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_direct_image_user',
        parts: [
          { type: 'text', text: 'describe this' },
          {
            type: 'file',
            mime: 'image/png',
            filename: 'sample.png',
            url: 'data:image/png;base64,aGVsbG8=',
          },
        ],
      },
    });

    expect(sentMessage.images).toEqual([{ data: 'aGVsbG8=', mimeType: 'image/png' }]);
    expect(sentMessage.text).toContain('describe this');
  });

  test('non-data image URLs are rejected before calling the Cursor SDK', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-url-image-'));
    let promptRunCalled = false;
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      createPromptRun: async () => {
        promptRunCalled = true;
        throw new Error('should not call Cursor SDK');
      },
    });

    const result = await runtime.handlePromptAsync({
      sessionID: 'ses_url_image',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_url_image_user',
        parts: [
          { type: 'text', text: 'describe this' },
          {
            type: 'file',
            mime: 'image/png',
            filename: 'remote.png',
            url: 'https://example.com/remote.png',
          },
        ],
      },
    });

    const records = await runtime.getSessionMessages('ses_url_image');
    const assistantText = records
      .find((record) => record.info.role === 'assistant')
      ?.parts
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n') || '';

    expect(promptRunCalled).toBe(false);
    expect(result).toEqual({ handled: true, status: 204, body: null });
    expect(assistantText).toContain('Cursor SDK provider sessions support data-backed image attachments only.');
    expect(assistantText).not.toContain('Cursor SDK error: URL images');
  });

  test('non-image attachments still produce the unsupported Cursor attachment message', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-pdf-'));
    let promptRunCalled = false;
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      createPromptRun: async () => {
        promptRunCalled = true;
        throw new Error('should not call Cursor SDK');
      },
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_pdf_attachment',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_pdf_attachment_user',
        parts: [
          { type: 'text', text: 'read this' },
          {
            type: 'file',
            mime: 'application/pdf',
            filename: 'document.pdf',
            url: 'data:application/pdf;base64,JVBERi0xLjQ=',
          },
        ],
      },
    });

    const records = await runtime.getSessionMessages('ses_pdf_attachment');
    const assistantText = records
      .find((record) => record.info.role === 'assistant')
      ?.parts
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n') || '';

    expect(promptRunCalled).toBe(false);
    expect(assistantText).toContain('Cursor SDK provider sessions support image attachments only.');
    expect(assistantText).toContain('document.pdf (application/pdf)');
  });
});
