import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTerminalRuntime } from './runtime.js';

const mockPtyProcess = {
  pid: 12345,
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onExit: vi.fn(() => ({ dispose: vi.fn() })),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess),
}));

function createRuntime(server, options = {}) {
  const routes = {
    post: new Map(),
    get: new Map(),
    delete: new Map(),
  };

  const app = {
    post(route, ...handlers) {
      routes.post.set(route, handlers);
    },
    get(route, ...handlers) {
      routes.get.set(route, handlers);
    },
    delete(route, ...handlers) {
      routes.delete.set(route, handlers);
    },
  };

  const runtime = createTerminalRuntime({
    app,
    server,
    express: { text: () => (_req, _res, next) => next?.() },
    fs,
    path,
    uiAuthController: null,
    buildAugmentedPath: () => process.env.PATH || '',
    searchPathFor: () => null,
    isExecutable: options.isExecutable ?? (() => false),
    isRequestOriginAllowed: async () => true,
    rejectWebSocketUpgrade() {},
    TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 30_000,
    TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1_000,
    TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW: 3,
  });

  return { runtime, routes };
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function callRoute(routes, method, route, req) {
  const handlers = routes[method].get(route);
  expect(handlers).toBeTruthy();
  const handler = handlers.at(-1);
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

describe('terminal runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes its websocket upgrade listener on shutdown', async () => {
    const server = new EventEmitter();
    const { runtime } = createRuntime(server);

    expect(server.listenerCount('upgrade')).toBe(1);

    await runtime.shutdown();

    expect(server.listenerCount('upgrade')).toBe(0);
  });

  it('returns 404 when touching a missing terminal session', async () => {
    const server = new EventEmitter();
    const { runtime, routes } = createRuntime(server);

    const res = await callRoute(routes, 'post', '/api/terminal/:sessionId/touch', {
      params: { sessionId: 'missing-session' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Terminal session not found' });

    await runtime.shutdown();
  });

  it('touches an existing terminal session and returns the updated activity timestamp', async () => {
    const server = new EventEmitter();
    const { runtime, routes } = createRuntime(server, {
      isExecutable: (candidate) => candidate === '/bin/sh',
    });

    const createRes = await callRoute(routes, 'post', '/api/terminal/create', {
      body: { cwd: process.cwd(), cols: 80, rows: 24 },
    });

    expect(createRes.statusCode).toBe(200);
    const sessionId = createRes.body.sessionId;
    const beforeTouch = Date.now();

    const touchRes = await callRoute(routes, 'post', '/api/terminal/:sessionId/touch', {
      params: { sessionId },
    });

    expect(touchRes.statusCode).toBe(200);
    expect(touchRes.body.success).toBe(true);
    expect(touchRes.body.lastActivity).toBeGreaterThanOrEqual(beforeTouch);

    await runtime.shutdown();
  });
});
