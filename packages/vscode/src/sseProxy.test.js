import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeClient: vi.fn(() => ({
    event: {
      subscribe: mocks.subscribe,
    },
    global: {
      event: vi.fn(),
    },
  })),
}));

const { openSseProxy } = await import('./sseProxy');

const createManager = () => ({
  getApiUrl: () => 'http://127.0.0.1:4096',
  getOpenCodeAuthHeaders: () => ({}),
  getWorkingDirectory: () => '/tmp/project',
});

const createFailingStream = (error) => ({
  [Symbol.asyncIterator]() {
    return {
      async next() {
        throw error;
      },
    };
  },
});

describe('openSseProxy abort handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.subscribe.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not reject with the stale socket error when a reconnect attempt aborts', async () => {
    const controller = new AbortController();
    const socketError = new Error('socket closed');
    socketError.cause = { code: 'UND_ERR_SOCKET' };

    mocks.subscribe
      .mockReturnValueOnce({ stream: createFailingStream(socketError) })
      .mockImplementationOnce(() => {
        controller.abort(new DOMException('Aborted', 'AbortError'));
        throw new DOMException('Aborted', 'AbortError');
      });

    const start = await openSseProxy({
      manager: createManager(),
      path: '/event',
      signal: controller.signal,
      onChunk: vi.fn(),
    });

    const run = start.run;
    await vi.advanceTimersByTimeAsync(1000);

    await expect(run).resolves.toBeUndefined();
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  });
});
