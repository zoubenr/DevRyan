import { mkdtempSync, rmSync } from 'fs';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCursorSdkRuntime } from '@openchamber/cursor-sdk-runtime';

const waitFor = async (predicate) => {
  for (let index = 0; index < 25; index += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
};

describe('Cursor SDK runtime', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('keeps SDK assistant messages after the submitted user message with agent metadata', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      loadSdk: async () => ({
        Agent: {
          create: async () => ({
            agentId: 'agent-test',
            send: async () => ({
              stream: async function* stream() {
                yield {
                  type: 'assistant',
                  message: {
                    content: [{ type: 'text', text: 'SDK_INTERCEPT' }],
                  },
                };
                yield {
                  type: 'assistant',
                  message: {
                    content: [{ type: 'text', text: '_OK' }],
                  },
                };
              },
            }),
          }),
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        agent: 'builder',
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(records?.map((record) => record.info.role)).toEqual(['user', 'assistant']);
    expect(records?.[0]?.info).toMatchObject({
      id: 'msg_e999_user',
      providerID: 'cursor-acp',
      modelID: 'composer-2.5',
      agent: 'builder',
    });
    expect(records?.[1]?.info).toMatchObject({
      id: 'msg_e999_user_assistant',
      parentID: 'msg_e999_user',
      providerID: 'cursor-acp',
      modelID: 'composer-2.5',
      agent: 'builder',
      finish: 'stop',
    });
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('SDK_INTERCEPT_OK');
  });

  it('uses the direct Cursor SDK wait result when the stream has no assistant text', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      loadSdk: async () => ({
        Agent: {
          create: async () => ({
            agentId: 'agent-test',
            send: async () => ({
              stream: async function* stream() {},
              wait: async () => ({
                status: 'finished',
                result: 'All tests have passed successfully.',
              }),
            }),
          }),
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(runtime.getRuntimeStatus().activeRuns).toBe(0);
    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('All tests have passed successfully.');
  });

  it('uses the direct Cursor SDK wait result when the stream remains open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      loadSdk: async () => ({
        Agent: {
          create: async () => ({
            agentId: 'agent-test',
            send: async () => ({
              stream: async function* stream() {
                await new Promise(() => {});
              },
              wait: async () => ({
                status: 'finished',
                result: 'Final result from wait.',
              }),
            }),
          }),
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(runtime.getRuntimeStatus().activeRuns).toBe(0);
    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('Final result from wait.');
  });

  it('merges a richer direct Cursor SDK wait result after partial streamed text', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      loadSdk: async () => ({
        Agent: {
          create: async () => ({
            agentId: 'agent-test',
            send: async () => ({
              stream: async function* stream() {
                yield {
                  type: 'assistant',
                  message: {
                    content: [{ type: 'text', text: 'All tests' }],
                  },
                };
              },
              wait: async () => ({
                status: 'finished',
                result: 'All tests have passed successfully.',
              }),
            }),
          }),
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('All tests have passed successfully.');
  });

  it('sends synthetic context to the SDK without storing it in the visible user message', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    let sentPrompt = '';
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async ({ prompt }) => {
        sentPrompt = prompt;
        return {
          cancel: async () => {},
          stream: async function* stream() {
            yield {
              type: 'message',
              message: {
                type: 'assistant',
                message: {
                  content: [{ type: 'text', text: 'done' }],
                },
              },
            };
          },
        };
      },
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [
          { type: 'text', text: 'Hidden context', synthetic: true },
          { type: 'text', text: 'Visible prompt' },
        ],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(sentPrompt).toContain('Hidden context');
    expect(sentPrompt).toContain('Visible prompt');
    expect(records?.[0]?.parts?.find((part) => part.type === 'text')?.text).toBe('Visible prompt');
  });

  it('finalizes still-running SDK tool parts when the assistant run completes', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'grep',
              status: 'running',
              args: { pattern: 'Open request form' },
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'done' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const tool = records?.[1]?.parts?.find((part) => part.type === 'tool');
    expect(tool?.state?.status).toBe('completed');
    expect(typeof tool?.state?.time?.end).toBe('number');
  });

  it('does not re-emit large completed Cursor tool parts after later stream events', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const emitted = [];
    const largeTaskOutput = 'x'.repeat(256 * 1024);
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'task_1',
              name: 'task',
              status: 'completed',
              args: { description: 'Explore service loading' },
              result: largeTaskOutput,
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'Continuing after task.' }],
              },
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'read_1',
              name: 'read',
              status: 'completed',
              args: { path: 'src/a.ts' },
              result: 'export const value = 1;',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'Done.' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_large_tool',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_large_tool_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_large_tool');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const taskEvents = emitted.filter((event) => (
      event?.type === 'message.part.updated'
      && event.properties?.part?.tool === 'task'
    ));
    expect(taskEvents).toHaveLength(1);
    expect(taskEvents[0]?.properties?.part?.output).toBe(largeTaskOutput);
    expect(records?.[1]?.parts?.find((part) => part.tool === 'task')?.output).toBe(largeTaskOutput);
  });

  it('does not emit duplicate Cursor tool updates when the SDK repeats the same state', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const emitted = [];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          for (let index = 0; index < 2; index += 1) {
            yield {
              type: 'message',
              message: {
                type: 'tool_call',
                call_id: 'read_1',
                name: 'read',
                status: 'running',
                args: { path: 'src/a.ts' },
              },
            };
          }
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'done' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_duplicate_tool',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_duplicate_tool_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_duplicate_tool');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const readEvents = emitted.filter((event) => (
      event?.type === 'message.part.updated'
      && event.properties?.part?.tool === 'read'
    ));
    expect(readEvents.map((event) => event.properties.part.state.status)).toEqual(['running', 'completed']);
  });

  it('finishes the assistant turn when Cursor emits a terminal status before closing the stream', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'grep',
              status: 'running',
              args: { pattern: 'Open request form' },
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'done' }],
              },
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'status',
              status: 'FINISHED',
            },
          };
          await new Promise(() => {});
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(runtime.getRuntimeStatus().activeRuns).toBe(0);
    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('done');
    expect(records?.[1]?.parts?.find((part) => part.type === 'tool')?.state?.status).toBe('completed');
  });

  it('finishes quiet Cursor streams after substantial assistant text and completed tool activity', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      streamIdleTimeoutMs: 20,
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'read',
              status: 'completed',
              args: { path: 'src/pages/dashboard/Practice/Reviews.tsx' },
              result: 'export function Reviews() {}',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: 'The Open request form button is already removed from the professional reviews page, and the related review test now asserts that it stays absent.',
                }],
              },
            },
          };
          await new Promise(() => {});
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(runtime.getRuntimeStatus().activeRuns).toBe(0);
    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'tool')?.state?.status).toBe('completed');
  });

  it('finishes quiet Cursor streams after a short assistant summary and completed tool activity', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      streamIdleTimeoutMs: 20,
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'bash',
              status: 'completed',
              args: { command: 'bun test' },
              result: 'pass',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'All tests have passed successfully.' }],
              },
            },
          };
          await new Promise(() => {});
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(runtime.getRuntimeStatus().activeRuns).toBe(0);
    expect(records?.[1]?.info.finish).toBe('stop');
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('All tests have passed successfully.');
    expect(records?.[1]?.parts?.find((part) => part.type === 'tool')?.state?.status).toBe('completed');
  });

  it('stamps text and reasoning end times when finalizing a Cursor run', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield { type: 'message', message: { type: 'thinking', text: 'I will run the tests.' } };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'All tests have passed successfully.' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const text = records?.[1]?.parts?.find((part) => part.type === 'text');
    const reasoning = records?.[1]?.parts?.find((part) => part.type === 'reasoning');
    expect(typeof text?.time?.end).toBe('number');
    expect(typeof reasoning?.time?.end).toBe('number');
  });

  it('records Cursor thinking incrementally and mirrors tool input/output into state for UI rendering', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield { type: 'message', message: { type: 'thinking', text: 'I will inspect ' } };
          yield { type: 'message', message: { type: 'thinking', text: 'the files.' } };
          yield { type: 'message', message: { type: 'thinking', text: 'The button is gone.' } };
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'grep',
              status: 'completed',
              args: { pattern: 'Open request form' },
              result: 'src/pages/dashboard/Practice/Reviews.tsx:40:Open request form',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'done' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const assistantParts = records?.[1]?.parts ?? [];
    expect(assistantParts.find((part) => part.type === 'reasoning')?.text).toBe('I will inspect the files. The button is gone.');

    const tool = assistantParts.find((part) => part.type === 'tool');
    expect(tool?.input).toEqual({ pattern: 'Open request form' });
    expect(tool?.output).toBe('src/pages/dashboard/Practice/Reviews.tsx:40:Open request form');
    expect(tool?.state).toMatchObject({
      status: 'completed',
      input: { pattern: 'Open request form' },
      output: 'src/pages/dashboard/Practice/Reviews.tsx:40:Open request form',
    });
  });

  it('starts a new Cursor thinking block when thinking resumes after tool activity', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield { type: 'message', message: { type: 'thinking', text: 'I will inspect ' } };
          yield { type: 'message', message: { type: 'thinking', text: 'the reviews page.' } };
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'grep',
              status: 'completed',
              args: { pattern: 'Open request form' },
              result: 'src/pages/dashboard/Practice/Reviews.tsx:40:Open request form',
            },
          };
          yield { type: 'message', message: { type: 'thinking', text: 'The button only exists in the clinic page.' } };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'done' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const assistantParts = records?.[1]?.parts ?? [];
    const reasoningParts = assistantParts.filter((part) => part.type === 'reasoning');
    expect(reasoningParts.map((part) => part.text)).toEqual([
      'I will inspect the reviews page.',
      'The button only exists in the clinic page.',
    ]);

    const toolIndex = assistantParts.findIndex((part) => part.type === 'tool');
    expect(toolIndex).toBeGreaterThan(reasoningParts.length === 0 ? -1 : assistantParts.indexOf(reasoningParts[0]));
    expect(assistantParts.indexOf(reasoningParts[1])).toBeGreaterThan(toolIndex);
  });

  it('removes dangling Cursor thinking fragments left before tool activity', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'thinking',
              text: 'Good. So for the professional dashboard, the required changes are:\n\n1.',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'grep',
              status: 'completed',
              args: { pattern: 'Reviews & Reputation' },
              result: 'src/pages/dashboard/Practice/Reviews.tsx:272:Reviews & Reputation',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'done' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_reasoning_trim',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_reasoning_trim_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_reasoning_trim');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const reasoning = records?.[1]?.parts?.find((part) => part.type === 'reasoning');
    expect(reasoning?.text).toBe('Good.');
  });

  it('preserves Cursor stream order across text, tools, thinking, and final plan text', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const structuredPlanBody = [
      '# Cursor Plan Card Fix',
      '',
      '## Context',
      '',
      'Cursor emits interleaved stream events.',
      '',
      '## Implementation',
      '',
      '1. Preserve chronological parts.',
    ].join('\n');

    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'I will inspect the repo first.' }],
              },
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'grep',
              status: 'completed',
              args: { pattern: 'Cursor SDK' },
              result: 'packages/cursor-sdk-runtime/index.js:1:Cursor SDK',
            },
          };
          yield {
            type: 'message',
            message: { type: 'thinking', text: 'The grep result points at the adapter.' },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: structuredPlanBody }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_plan_order',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_plan_order_user',
        parts: [
          {
            type: 'text',
            text: 'User has requested to enter plan mode.\nProduce an implementation plan only.',
            synthetic: true,
          },
          { type: 'text', text: 'make a plan' },
        ],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_plan_order');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const assistantParts = records?.[1]?.parts ?? [];
    expect(assistantParts.map((part) => part.type)).toEqual(['text', 'tool', 'reasoning', 'text']);
    expect(assistantParts[0]?.text).toBe('I will inspect the repo first.');
    expect(assistantParts[1]?.tool).toBe('grep');
    expect(assistantParts[2]?.text).toBe('The grep result points at the adapter.');
    expect(assistantParts[3]?.text).toBe(`<!--plan-->\n${structuredPlanBody}`);
    expect(assistantParts.map((part) => part.id)).toEqual([
      'msg_plan_order_user_assistant_part_000001_text',
      'msg_plan_order_user_assistant_part_000002_tool_tool_1',
      'msg_plan_order_user_assistant_part_000003_reasoning',
      'msg_plan_order_user_assistant_part_000004_text',
    ]);
  });

  it('exposes Cursor session status as busy during a run and idle after completion', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    let releaseStream;
    const streamReady = new Promise((resolve) => {
      releaseStream = resolve;
    });
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'edit_1',
              name: 'edit',
              status: 'completed',
              args: { path: 'src/a.ts' },
              result: 'edited',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'working' }],
              },
            },
          };
          await streamReady;
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: ' done' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_status',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_status_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    await waitFor(async () => (
      runtime.getSessionStatus?.().ses_status?.type === 'busy' ? true : null
    ));
    expect(runtime.getSessionStatus?.().ses_status).toEqual({ type: 'busy' });

    releaseStream();

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_status');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('working done');
    expect(runtime.getSessionStatus?.().ses_status).toEqual({ type: 'idle' });
  });

  it('repairs persisted SDK assistant parent ids and stale running tools on read', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    writeFileSync(
      join(tempDir, 'ses_1.json'),
      `${JSON.stringify({
        sessionID: 'ses_1',
        agentID: null,
        records: [
          {
            info: {
              id: 'msg_e999_user',
              sessionID: 'ses_1',
              role: 'user',
              time: { created: 10 },
            },
            parts: [],
          },
          {
            info: {
              id: 'msg_e999_user_assistant',
              sessionID: 'ses_1',
              role: 'assistant',
              finish: 'stop',
              time: { created: 11, completed: 20 },
            },
            parts: [
              {
                id: 'msg_e999_user_assistant_tool_1',
                sessionID: 'ses_1',
                messageID: 'msg_e999_user_assistant',
                type: 'tool',
                tool: 'grep',
                input: { pattern: 'Open request form' },
                output: 'src/a.ts:1:Open request form',
                state: { status: 'running', time: { start: 12 } },
              },
            ],
          },
        ],
      })}\n`,
    );
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {},
      }),
    });

    const records = await runtime.getSessionMessages('ses_1');

    expect(records[1]?.info.parentID).toBe('msg_e999_user');
    expect(records[1]?.parts?.[0]?.state).toMatchObject({
      status: 'completed',
      input: { pattern: 'Open request form' },
      output: 'src/a.ts:1:Open request form',
      time: { start: 12, end: 20 },
    });
  });

  it('synthesizes an apply_patch tool when a Cursor SDK run changes the workspace diff', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1,2 @@',
      '-old',
      '+new',
      '+line',
    ].join('\n');
    const diffs = ['', patch];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      getWorkspaceDiff: async () => diffs.shift() ?? patch,
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'edit_1',
              name: 'edit',
              status: 'completed',
              args: { path: 'src/a.ts' },
              result: 'edited',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'edited' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const patchTool = records?.[1]?.parts?.find((part) => part.type === 'tool' && part.tool === 'apply_patch');
    expect(patchTool?.state).toMatchObject({
      status: 'completed',
      output: 'Applied 1 patch.',
      metadata: {
        files: [
          {
            relativePath: 'src/a.ts',
            additions: 2,
            deletions: 1,
          },
        ],
      },
    });
    expect(patchTool?.state?.metadata?.patchText).toContain('+line');
  });

  it('adds scoped diff summary metadata to Cursor user messages when the workspace changes', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1,2 @@',
      '-old',
      '+new',
      '+line',
    ].join('\n');
    const diffs = ['', patch];
    const emitted = [];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      getWorkspaceDiff: async () => diffs.shift() ?? patch,
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'edit_1',
              name: 'edit',
              status: 'completed',
              args: { path: 'src/a.ts' },
              result: 'edited',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'edited' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(records?.[0]?.info.summary).toEqual({
      diffs: [{ file: 'src/a.ts', additions: 2, deletions: 1 }],
    });
    expect(emitted.some((event) => (
      event?.type === 'message.updated'
      && event.properties?.info?.id === 'msg_e999_user'
      && event.properties.info.summary?.diffs?.[0]?.file === 'src/a.ts'
    ))).toBe(true);
  });

  it('does not synthesize diff metadata for search-only Cursor SDK turns', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1,2 @@',
      '-old',
      '+new',
      '+line',
    ].join('\n');
    const diffs = ['', patch];
    const emitted = [];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      getWorkspaceDiff: async () => diffs.shift() ?? patch,
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'grep_1',
              name: 'grep',
              status: 'completed',
              args: { pattern: 'old' },
              result: 'src/a.ts:1:old',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'read_1',
              name: 'read',
              status: 'completed',
              args: { path: 'src/a.ts' },
              result: 'old',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'searched only' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_search_only',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_search_only_user',
        parts: [{ type: 'text', text: 'search for old' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_search_only');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(records?.[0]?.info.summary).toBe(undefined);
    expect(records?.[1]?.parts?.some((part) => part.type === 'tool' && part.tool === 'apply_patch')).toBe(false);
    expect(emitted.some((event) => (
      event?.type === 'message.updated'
      && event.properties?.info?.id === 'msg_search_only_user'
      && Array.isArray(event.properties.info.summary?.diffs)
    ))).toBe(false);
  });

  it('emits the synthesized apply_patch tool before finalizing the assistant turn', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1,2 @@',
      '-old',
      '+new',
      '+line',
    ].join('\n');
    const diffs = ['', patch, patch];
    const emitted = [];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      getWorkspaceDiff: async () => diffs.shift() ?? patch,
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_1',
              name: 'bash',
              status: 'completed',
              args: { command: 'perl -0pi -e s/old/new/ src/a.ts' },
              result: 'done',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'edited' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish);
    });

    const patchEventIndex = emitted.findIndex((event) => (
      event?.type === 'message.part.updated'
      && event.properties?.part?.type === 'tool'
      && event.properties.part.tool === 'apply_patch'
    ));
    const finalEventIndex = emitted.findIndex((event) => (
      event?.type === 'message.updated'
      && event.properties?.info?.role === 'assistant'
      && event.properties.info.finish === 'stop'
    ));

    expect(patchEventIndex).toBeGreaterThan(-1);
    expect(finalEventIndex).toBeGreaterThan(-1);
    expect(patchEventIndex).toBeLessThan(finalEventIndex);
  });

  it('emits message.part.removed when a synthesized Cursor patch disappears before finalization', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const diffs = ['', patch, ''];
    const emitted = [];
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (payload) => emitted.push(payload),
      getWorkspaceDiff: async () => diffs.shift() ?? '',
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'edit_1',
              name: 'edit',
              status: 'completed',
              args: { path: 'src/a.ts' },
              result: 'edited',
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'reverted before finishing' }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_patch_removed',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_patch_removed_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_patch_removed');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const patchEvent = emitted.find((event) => (
      event?.type === 'message.part.updated'
      && event.properties?.part?.tool === 'apply_patch'
    ));
    expect(patchEvent).toBeTruthy();
    expect(emitted).toContainEqual({
      type: 'message.part.removed',
      properties: {
        messageID: 'msg_patch_removed_user_assistant',
        partID: patchEvent.properties.part.id,
      },
    });
    expect(records?.[1]?.parts?.some((part) => part.tool === 'apply_patch')).toBe(false);
  });

  it('marks SDK stream failures as completed error messages and clears active status', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'partial' }],
              },
            },
          };
          throw new Error('stream exploded');
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        agent: 'builder',
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish === 'error')
        ? current
        : null;
    });

    expect(runtime.getRuntimeStatus()).toMatchObject({
      activeRuns: 0,
      lastError: 'stream exploded',
    });
    expect(records?.[1]?.info).toMatchObject({
      role: 'assistant',
      finish: 'error',
    });
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('partial');
  });

  it('creates a fresh Cursor agent when a saved agent id is stale', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    writeFileSync(
      join(tempDir, 'ses_1.json'),
      `${JSON.stringify({ sessionID: 'ses_1', agentID: 'agent-stale', records: [] })}\n`,
    );
    let created = false;
    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      loadSdk: async () => ({
        Agent: {
          resume: async () => {
            throw new Error('Agent agent-stale not found');
          },
          create: async () => {
            created = true;
            return {
              agentId: 'agent-fresh',
              send: async () => ({
                stream: async function* stream() {
                  yield {
                    type: 'assistant',
                    message: {
                      content: [{ type: 'text', text: 'fresh' }],
                    },
                  };
                },
              }),
            };
          },
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_1',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_e999_user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_1');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(created).toBe(true);
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text).toBe('fresh');
  });

  it('injects a plan card sentinel for plan-mode prompts that omit it', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const structuredPlanBody = [
      '# Cursor Plan Card Fix',
      '',
      '## Context',
      '',
      'Cursor models omit the sentinel.',
      '',
      '## Implementation',
      '',
      '1. Add fallback detection.',
    ].join('\n');

    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: structuredPlanBody }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_plan',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_plan_user',
        parts: [
          {
            type: 'text',
            text: 'User has requested to enter plan mode.\nProduce an implementation plan only.',
            synthetic: true,
          },
          { type: 'text', text: 'make a plan' },
        ],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_plan');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const text = records?.[1]?.parts?.find((part) => part.type === 'text')?.text ?? '';
    expect(text.startsWith('<!--plan-->\n')).toBe(true);
    expect(text).toContain('## Context');
    expect(text).toContain('## Implementation');
  });

  it('detects plan mode when the visible prompt precedes synthetic plan instructions', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const structuredPlanBody = [
      '# Cursor Plan Card Fix',
      '',
      '## Context',
      '',
      'Cursor models omit the sentinel.',
      '',
      '## Implementation',
      '',
      '1. Add fallback detection.',
    ].join('\n');
    let capturedPrompt = '';

    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async ({ prompt }) => {
        capturedPrompt = prompt;
        return {
          cancel: async () => {},
          stream: async function* stream() {
            yield {
              type: 'message',
              message: {
                type: 'assistant',
                message: {
                  content: [{ type: 'text', text: structuredPlanBody }],
                },
              },
            };
          },
        };
      },
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_plan_visible_first',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_plan_visible_first_user',
        parts: [
          { type: 'text', text: 'make a plan' },
          {
            type: 'text',
            text: 'User has requested to enter plan mode.\nProduce an implementation plan only.',
            synthetic: true,
          },
        ],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_plan_visible_first');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    expect(capturedPrompt.startsWith('User has requested to enter plan mode')).toBe(true);
    expect(capturedPrompt).toContain('\n\nmake a plan');
    expect(records?.[0]?.info?.metadata).toMatchObject({ openchamberPlanMode: true });
    expect(records?.[0]?.parts?.map((part) => part.text)).toEqual([
      'make a plan',
      'User has requested to enter plan mode.\nProduce an implementation plan only.',
    ]);
    expect(records?.[0]?.parts?.[1]?.synthetic).toBe(true);
    expect(records?.[1]?.parts?.find((part) => part.type === 'text')?.text)
      .toBe(`<!--plan-->\n${structuredPlanBody}`);
  });

  it('normalizes streamed Cursor plan text before emitting the part update', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const structuredPlanBody = [
      '# Cursor Plan Card Fix',
      '',
      '## Context',
      '',
      'Cursor models omit the sentinel.',
      '',
      '## Implementation',
      '',
      '1. Add fallback detection.',
    ].join('\n');
    const events = [];

    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: (event) => {
        events.push(event);
      },
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: structuredPlanBody }],
              },
            },
          };
          yield {
            type: 'message',
            message: {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: structuredPlanBody }],
              },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_plan_stream_normalize',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_plan_stream_normalize_user',
        parts: [
          { type: 'text', text: 'make a plan' },
          {
            type: 'text',
            text: 'User has requested to enter plan mode.\nProduce an implementation plan only.',
            synthetic: true,
          },
        ],
      },
    });

    await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_plan_stream_normalize');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const structuredPlanUpdates = events
      .filter((event) => event.type === 'message.part.updated')
      .map((event) => event.properties?.part)
      .filter((part) => part?.type === 'text' && typeof part.text === 'string' && part.text.includes(structuredPlanBody));
    const streamingStructuredPlanUpdates = structuredPlanUpdates.filter((part) => typeof part.time?.end !== 'number');

    expect(structuredPlanUpdates.length).toBeGreaterThan(0);
    expect(structuredPlanUpdates.every((part) => part.text.startsWith('<!--plan-->\n'))).toBe(true);
    expect(streamingStructuredPlanUpdates).toHaveLength(1);
  });

  it('promotes Cursor createPlan tool payloads into plan card text', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cursor-sdk-runtime-'));
    const structuredPlanBody = [
      '# Cursor Plan Card Fix',
      '',
      '## Context',
      '',
      'Cursor models can emit createPlan tool calls.',
      '',
      '## Implementation',
      '',
      '1. Promote the tool plan into a text part.',
      '',
      '## Verification',
      '',
      '1. Render the plan card.',
    ].join('\n');

    const runtime = createCursorSdkRuntime({
      storageDir: tempDir,
      readAuth: () => ({ 'cursor-acp': { key: 'cursor-sdk-key' } }),
      env: {},
      emitEvent: () => {},
      createPromptRun: async () => ({
        cancel: async () => {},
        stream: async function* stream() {
          yield {
            type: 'message',
            message: {
              type: 'tool_call',
              call_id: 'tool_plan',
              name: 'createPlan',
              status: 'completed',
              args: { plan: structuredPlanBody },
              result: { status: 'success', value: {} },
            },
          };
        },
      }),
    });

    await runtime.handlePromptAsync({
      sessionID: 'ses_plan_tool',
      directory: '/tmp/project',
      body: {
        model: { providerID: 'cursor-acp', modelID: 'composer-2.5' },
        messageID: 'msg_plan_tool_user',
        parts: [
          { type: 'text', text: 'make a plan' },
          {
            type: 'text',
            text: 'User has requested to enter plan mode.\nProduce an implementation plan only.',
            synthetic: true,
          },
        ],
      },
    });

    const records = await waitFor(async () => {
      const current = await runtime.getSessionMessages('ses_plan_tool');
      return current.some((record) => record.info?.role === 'assistant' && record.info?.finish)
        ? current
        : null;
    });

    const assistantParts = records?.[1]?.parts ?? [];
    expect(assistantParts.map((part) => part.type)).toEqual(['tool', 'text']);
    expect(assistantParts[0]?.tool).toBe('createPlan');
    expect(assistantParts[1]?.text).toBe(`<!--plan-->\n${structuredPlanBody}`);
  });
});
