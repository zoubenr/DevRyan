import { describe, expect, it, vi } from 'vitest';

import { createAgentRuntimeWarmup } from './agent-runtime-warmup.js';

describe('agent runtime warmup', () => {
  it('runs only safe read-only startup tasks', async () => {
    const requested = [];
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer test' }),
      fetchImpl: vi.fn(async (url, options) => {
        requested.push({ url: String(url), method: options?.method ?? 'GET' });
        if (String(url).endsWith('/config/providers?directory=%2Fproject')) {
          return Response.json({ providers: [], default: {} });
        }
        if (String(url).endsWith('/agent?directory=%2Fproject')) {
          return Response.json([]);
        }
        if (String(url).endsWith('/session/status?directory=%2Fproject')) {
          return Response.json({});
        }
        return Response.json({ ok: true });
      }),
      discoverSkills: () => [
        { name: 'using-superpowers', path: '/skills/using-superpowers/SKILL.md' },
        { name: 'other', path: '/skills/other/SKILL.md' },
      ],
      readSkillFile: vi.fn(() => 'skill content'),
      now: () => 1_000,
    });

    const result = await warmup.warm({ directory: '/project', timeoutMs: 1_000 });

    expect(result.status).toBe('ready');
    expect(result.timedOut).toBe(false);
    expect(result.tasks.map((task) => task.name)).toEqual([
      'health',
      'config',
      'providers',
      'agents',
      'sessionStatus',
      'opencodeSkills',
      'mcp',
      'commands',
      'skills',
    ]);
    expect(requested.map((entry) => {
      const url = new URL(entry.url);
      return `${entry.method} ${url.pathname}${url.search}`;
    })).toEqual([
      'GET /health',
      'GET /config?directory=%2Fproject',
      'GET /config/providers?directory=%2Fproject',
      'GET /agent?directory=%2Fproject',
      'GET /session/status?directory=%2Fproject',
      'GET /skill?directory=%2Fproject',
      'GET /mcp?directory=%2Fproject',
      'GET /command?directory=%2Fproject',
    ]);
    expect(requested.some((entry) => /prompt|prompt_async/.test(entry.url))).toBe(false);
    expect(requested.some((entry) => entry.method !== 'GET')).toBe(false);
  });

  it('returns per-task errors without failing the whole warmup', async () => {
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async (url) => {
        if (String(url).includes('/agent?')) {
          throw new Error('agent fetch failed');
        }
        return Response.json({});
      }),
      discoverSkills: () => [],
      readSkillFile: vi.fn(),
      now: () => 1_000,
    });

    const result = await warmup.warm({ directory: '/project', timeoutMs: 1_000 });

    expect(result.status).toBe('ready');
    expect(result.tasks.find((task) => task.name === 'agents')).toEqual(expect.objectContaining({
      status: 'error',
      error: 'agent fetch failed',
    }));
  });

  it('persists the latest warmup diagnostics with timestamp, directory, errors, and timeout state', async () => {
    let currentTime = 10_000;
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async (url) => {
        if (String(url).includes('/agent?')) {
          throw new Error('agent fetch failed');
        }
        return Response.json({});
      }),
      discoverSkills: () => [],
      readSkillFile: vi.fn(),
      now: () => currentTime,
    });

    currentTime = 11_000;
    const result = await warmup.warm({ directory: '/project', timeoutMs: 1_000 });
    const latest = warmup.getLatestResult();

    expect(latest).toEqual(expect.objectContaining({
      timestamp: 11_000,
      directory: '/project',
      timedOut: false,
      status: 'ready',
    }));
    expect(latest.tasks).toEqual(result.tasks);
    expect(latest.errors).toEqual([
      { name: 'agents', status: 'error', error: 'agent fetch failed' },
    ]);
    expect(latest.harness).toEqual(expect.objectContaining({
      status: 'warning',
      summary: expect.stringContaining('completed with 1 issue'),
    }));
  });

  it('caps warmup time and reports a timeout', async () => {
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: vi.fn(() => new Promise(() => {})),
      discoverSkills: () => [],
      readSkillFile: vi.fn(),
      now: () => Date.now(),
    });

    const result = await warmup.warm({
      directory: '/project',
      timeoutMs: 1,
      commandTimeoutMs: 1,
      mcpTimeoutMs: 1,
    });

    expect(result.status).toBe('ready');
    expect(result.timedOut).toBe(true);
    expect(result.tasks.some((task) => task.status === 'timeout')).toBe(true);
  });

  it('allows command discovery to outlive the short general warmup timeout', async () => {
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async (url) => {
        if (String(url).includes('/command?')) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return Response.json({});
      }),
      discoverSkills: () => [],
      readSkillFile: vi.fn(),
      now: () => Date.now(),
    });

    const result = await warmup.warm({ directory: '/project', timeoutMs: 1, commandTimeoutMs: 50 });

    expect(result.tasks.find((task) => task.name === 'commands')).toEqual(expect.objectContaining({
      status: 'ready',
    }));
  });

  it('allows MCP status to outlive the short general warmup timeout', async () => {
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async (url) => {
        if (String(url).includes('/mcp?')) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return Response.json({});
      }),
      discoverSkills: () => [],
      readSkillFile: vi.fn(),
      now: () => Date.now(),
    });

    const result = await warmup.warm({ directory: '/project', timeoutMs: 1, mcpTimeoutMs: 50 });

    expect(result.tasks.find((task) => task.name === 'mcp')).toEqual(expect.objectContaining({
      status: 'ready',
    }));
  });

  it('waits for MCP status before command discovery', async () => {
    const events = [];
    const warmup = createAgentRuntimeWarmup({
      buildOpenCodeUrl: (requestPath) => `http://opencode.test${requestPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async (url) => {
        if (String(url).includes('/mcp?')) {
          events.push('mcp-start');
          await new Promise((resolve) => setTimeout(resolve, 5));
          events.push('mcp-end');
        }
        if (String(url).includes('/command?')) {
          events.push('command-start');
        }
        return Response.json({});
      }),
      discoverSkills: () => [],
      readSkillFile: vi.fn(),
      now: () => Date.now(),
    });

    await warmup.warm({ directory: '/project', timeoutMs: 1_000 });

    expect(events.indexOf('mcp-end')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('command-start')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('mcp-end')).toBeLessThan(events.indexOf('command-start'));
  });
});
