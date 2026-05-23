import { describe, expect, it, vi } from 'vitest';

import { createVSCodeToolsAPI } from './tools';

describe('VS Code tools runtime API', () => {
  it('matches the web tool manifest shape with VS Code runtime metadata', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(['patch', 'invalid', 'task']), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    try {
      const api = createVSCodeToolsAPI({ getDirectory: () => '/workspace' });

      await expect(api.getAvailableTools()).resolves.toEqual(['patch', 'task']);
      await expect(api.getToolManifest()).resolves.toEqual({
        tools: [
          { id: 'patch', aliases: ['edit', 'write', 'patch'], sourceRuntime: 'vscode', directory: '/workspace' },
          { id: 'task', aliases: ['task'], sourceRuntime: 'vscode', directory: '/workspace' },
        ],
        aliases: {
          patch: ['edit', 'write', 'patch'],
          task: ['task'],
        },
        sourceRuntime: 'vscode',
        directory: '/workspace',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
