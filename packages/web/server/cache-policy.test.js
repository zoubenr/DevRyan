import { describe, expect, it } from 'vitest';

import {
  applyDynamicNoStoreHeaders,
  shouldDisableHttpCache,
} from './lib/http-cache-policy.js';

describe('local HTTP cache policy', () => {
  it('marks dynamic API responses as no-store', () => {
    expect(shouldDisableHttpCache('/api/session/ses_123/message?limit=500')).toBe(true);
    expect(shouldDisableHttpCache('/api/git/file-diff?directory=/tmp/repo')).toBe(true);
    expect(shouldDisableHttpCache('/api/preview/proxy/id/src/App.tsx')).toBe(true);
    expect(shouldDisableHttpCache('/health')).toBe(true);
  });

  it('leaves static frontend assets cacheable', () => {
    expect(shouldDisableHttpCache('/assets/index-abc123.js')).toBe(false);
    expect(shouldDisableHttpCache('/favicon.ico')).toBe(false);
  });

  it('applies deterministic no-store headers without overwriting existing streaming policy', () => {
    const headers = new Map();
    const res = {
      getHeader(name) {
        return headers.get(name.toLowerCase());
      },
      setHeader(name, value) {
        headers.set(name.toLowerCase(), value);
      },
    };

    applyDynamicNoStoreHeaders({ originalUrl: '/api/session/ses_123/message' }, res);

    expect(headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(headers.get('pragma')).toBe('no-cache');
    expect(headers.get('expires')).toBe('0');

    headers.set('cache-control', 'no-cache, no-transform');
    applyDynamicNoStoreHeaders({ originalUrl: '/api/event' }, res);

    expect(headers.get('cache-control')).toBe('no-cache, no-transform');
  });
});
