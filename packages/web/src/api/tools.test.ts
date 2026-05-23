import { describe, expect, it, vi } from 'vitest';

import { createWebToolsAPI } from './tools';

describe('web tools runtime API', () => {
  it('keeps getAvailableTools unchanged while adding a normalized tool manifest', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(['write', 'invalid', 'read', 'edit']), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    try {
      const api = createWebToolsAPI({ getDirectory: () => '/repo' });

      await expect(api.getAvailableTools()).resolves.toEqual(['edit', 'read', 'write']);
      await expect(api.getToolManifest()).resolves.toEqual({
        tools: [
          { id: 'edit', aliases: ['edit', 'write', 'patch'], sourceRuntime: 'web', directory: '/repo' },
          { id: 'read', aliases: ['read'], sourceRuntime: 'web', directory: '/repo' },
          { id: 'write', aliases: ['edit', 'write', 'patch'], sourceRuntime: 'web', directory: '/repo' },
        ],
        aliases: {
          edit: ['edit', 'write', 'patch'],
          read: ['read'],
          write: ['edit', 'write', 'patch'],
        },
        sourceRuntime: 'web',
        directory: '/repo',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
