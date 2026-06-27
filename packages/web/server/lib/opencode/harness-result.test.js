import { describe, expect, it } from 'vitest';

import {
  createHarnessError,
  createHarnessSuccess,
  createHarnessWarning,
  withHarnessResult,
} from './harness-result.js';

describe('harness result helpers', () => {
  it('builds success envelopes with deterministic observation fields', () => {
    expect(createHarnessSuccess({
      summary: 'Warmup completed',
      nextActions: ['Open diagnostics'],
      artifacts: ['/tmp/report.json'],
    })).toEqual({
      status: 'success',
      summary: 'Warmup completed',
      nextActions: ['Open diagnostics'],
      artifacts: ['/tmp/report.json'],
      recovery: null,
    });
  });

  it('builds warning envelopes with retry and stop guidance', () => {
    expect(createHarnessWarning({
      summary: 'MCP status timed out',
      recovery: {
        rootCauseHint: 'MCP server did not answer within the warmup budget',
        safeRetry: 'Retry after the server reports ready',
        stopCondition: 'Stop retrying if the server stays unavailable after restart',
        retryable: true,
      },
    })).toEqual({
      status: 'warning',
      summary: 'MCP status timed out',
      nextActions: [],
      artifacts: [],
      recovery: {
        rootCauseHint: 'MCP server did not answer within the warmup budget',
        safeRetry: 'Retry after the server reports ready',
        stopCondition: 'Stop retrying if the server stays unavailable after restart',
        retryable: true,
      },
    });
  });

  it('builds error envelopes with explicit non-retry stop conditions', () => {
    expect(createHarnessError({
      summary: 'Invalid skill source',
      recovery: {
        rootCauseHint: 'The source URL could not be parsed',
        safeRetry: 'Retry with a GitHub owner/repo source',
        stopCondition: 'Stop if the source is not a GitHub repository',
        retryable: false,
      },
    }).recovery).toEqual({
      rootCauseHint: 'The source URL could not be parsed',
      safeRetry: 'Retry with a GitHub owner/repo source',
      stopCondition: 'Stop if the source is not a GitHub repository',
      retryable: false,
    });
  });

  it('adds harness metadata without replacing existing payload fields', () => {
    const payload = {
      status: 'ready',
      ok: true,
      items: [{ name: 'existing' }],
    };

    const wrapped = withHarnessResult(payload, createHarnessSuccess({
      summary: 'Catalog loaded',
      nextActions: ['Install a skill'],
    }));

    expect(wrapped.status).toBe('ready');
    expect(wrapped.ok).toBe(true);
    expect(wrapped.items).toEqual([{ name: 'existing' }]);
    expect(wrapped.harness).toEqual(expect.objectContaining({
      status: 'success',
      summary: 'Catalog loaded',
      nextActions: ['Install a skill'],
    }));
    expect(wrapped.summary).toBe('Catalog loaded');
    expect(wrapped.nextActions).toEqual(['Install a skill']);
  });
});
