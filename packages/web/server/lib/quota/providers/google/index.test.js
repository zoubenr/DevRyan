import { describe, expect, it, vi } from 'vitest';

import { fetchAntigravityQuota, fetchGoogleQuota } from './index.js';

const makeSource = (sourceId) => ({
  sourceId,
  sourceLabel: sourceId === 'gemini' ? 'Gemini' : 'Antigravity',
  accessToken: `${sourceId}-access-token`,
  projectId: `${sourceId}-project`,
});

describe('Google quota source split', () => {
  it('fetches only Gemini source usage for the Google provider', async () => {
    const fetchModels = vi.fn(async (_accessToken, _projectId, sourceId) => ({
      models: {
        [`${sourceId}-model`]: {
          quotaInfo: {
            remainingFraction: 0.25,
            resetTime: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    }));

    const result = await fetchGoogleQuota({
      authSources: [makeSource('gemini'), makeSource('antigravity')],
      fetchModels,
      fetchQuotaBuckets: async () => ({ buckets: [] }),
    });

    expect(result.providerId).toBe('google');
    expect(result.providerName).toBe('Google');
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(fetchModels.mock.calls[0][2]).toBe('gemini');
    expect(result.usage.windows).toEqual({});
    expect(Object.keys(result.usage.models)).toEqual(['gemini/gemini-model']);
  });

  it('does not treat Antigravity-only auth as configured Google usage', async () => {
    const result = await fetchGoogleQuota({
      authSources: [makeSource('antigravity')],
      fetchModels: vi.fn(),
      fetchQuotaBuckets: vi.fn(),
    });

    expect(result.providerId).toBe('google');
    expect(result.configured).toBe(false);
    expect(result.error).toBe('Not configured');
  });

  it('fetches only Antigravity source usage for the Antigravity provider', async () => {
    const fetchModels = vi.fn(async (_accessToken, _projectId, sourceId) => ({
      models: {
        [`${sourceId}/gemini-3-flash`]: {
          quotaInfo: {
            remainingFraction: 0.75,
            resetTime: '2099-01-01T00:00:00.000Z',
          },
        },
      },
    }));

    const result = await fetchAntigravityQuota({
      authSources: [makeSource('gemini'), makeSource('antigravity')],
      fetchModels,
      fetchQuotaBuckets: async () => ({ buckets: [] }),
    });

    expect(result.providerId).toBe('antigravity');
    expect(result.providerName).toBe('Antigravity');
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(fetchModels.mock.calls[0][2]).toBe('antigravity');
    expect(Object.keys(result.usage.models)).toEqual([
      'antigravity/claude-opus-4-6-thinking',
      'antigravity/claude-sonnet-4-6',
      'antigravity/gemini-3-flash',
      'antigravity/gemini-3-pro',
      'antigravity/gemini-3-1-pro',
    ]);
    expect(result.usage.models['antigravity/gemini-3-flash'].windows['daily'].usedPercent).toBe(25);
    expect(result.usage.models['antigravity/claude-opus-4-6-thinking'].windows['daily'].usedPercent).toBe(0);
    expect(result.usage.models['antigravity/claude-opus-4-6-thinking'].windows['daily'].resetAt)
      .toBe(Date.parse('2099-01-01T00:00:00.000Z'));
  });

  it('adds Antigravity provider summary windows from the most constrained model windows', async () => {
    const fetchModels = vi.fn(async () => ({
      models: {
        'gemini-3-flash': {
          quotaInfo: {
            remainingFraction: 0.75,
            resetTime: '2099-01-01T00:00:00.000Z',
          },
        },
        'claude-sonnet-4-6': {
          quotaInfo: {
            remainingFraction: 0.10,
            resetTime: '2099-01-01T01:00:00.000Z',
          },
        },
      },
    }));

    const result = await fetchAntigravityQuota({
      authSources: [makeSource('antigravity')],
      fetchModels,
      fetchQuotaBuckets: async () => ({ buckets: [] }),
    });

    expect(result.providerId).toBe('antigravity');
    expect(result.usage.windows['daily'].usedPercent).toBe(90);
    expect(result.usage.windows['daily'].resetAt).toBe(Date.parse('2099-01-01T01:00:00.000Z'));
    expect(Object.keys(result.usage.models)).toEqual([
      'antigravity/claude-opus-4-6-thinking',
      'antigravity/claude-sonnet-4-6',
      'antigravity/gemini-3-flash',
      'antigravity/gemini-3-pro',
      'antigravity/gemini-3-1-pro',
    ]);
  });

  it('filters Antigravity usage to the visible model catalog and derives summaries from those models only', async () => {
    const fetchModels = vi.fn(async () => ({
      models: {
        'antigravity-claude-opus-4-6-thinking': {
          quotaInfo: {
            remainingFraction: 0.80,
            resetTime: '2099-01-01T00:00:00.000Z',
          },
        },
        'antigravity/claude-sonnet-4-6': {
          quotaInfo: {
            remainingFraction: 0.70,
            resetTime: '2099-01-01T01:00:00.000Z',
          },
        },
        'gemini-3-flash': {
          quotaInfo: {
            remainingFraction: 0.60,
            resetTime: '2099-01-01T02:00:00.000Z',
          },
        },
        'Gemini 3 Pro': {
          quotaInfo: {
            remainingFraction: 0.50,
            resetTime: '2099-01-01T03:00:00.000Z',
          },
        },
        'gemini-3-1-pro': {
          quotaInfo: {
            remainingFraction: 0.40,
            resetTime: '2099-01-01T04:00:00.000Z',
          },
        },
        'unlisted-high-usage-model': {
          quotaInfo: {
            remainingFraction: 0.01,
            resetTime: '2099-01-01T05:00:00.000Z',
          },
        },
      },
    }));

    const result = await fetchAntigravityQuota({
      authSources: [makeSource('antigravity')],
      fetchModels,
      fetchQuotaBuckets: async () => ({ buckets: [] }),
    });

    expect(Object.keys(result.usage.models)).toEqual([
      'antigravity/claude-opus-4-6-thinking',
      'antigravity/claude-sonnet-4-6',
      'antigravity/gemini-3-flash',
      'antigravity/gemini-3-pro',
      'antigravity/gemini-3-1-pro',
    ]);
    expect(result.usage.models['antigravity/claude-opus-4-6-thinking'].displayName).toBe('Claude Opus 4.6 Thinking');
    expect(result.usage.models['antigravity/claude-opus-4-6-thinking'].contextLabel).toBe('200K');
    expect(result.usage.models['antigravity/gemini-3-flash'].displayName).toBe('Gemini 3 Flash');
    expect(result.usage.models['antigravity/gemini-3-flash'].contextLabel).toBe('1M');
    expect(result.usage.windows.daily.usedPercent).toBe(60);
  });

  it('maps Antigravity Gemini 3.1 Pro raw variants to the visible Gemini 3.1 Pro row', async () => {
    const fetchModels = vi.fn(async () => ({
      models: {
        'gemini-3.1-pro-high': {
          displayName: 'Gemini 3.1 Pro (High)',
          quotaInfo: {
            remainingFraction: 0.40,
            resetTime: '2099-01-01T00:00:00.000Z',
          },
        },
        'gemini-3.1-pro-low': {
          displayName: 'Gemini 3.1 Pro (Low)',
          quotaInfo: {
            remainingFraction: 0.40,
            resetTime: '2099-01-01T00:00:00.000Z',
          },
        },
        'gemini-pro-agent': {
          displayName: 'Gemini 3.1 Pro (High)',
          quotaInfo: {
            remainingFraction: 0.40,
            resetTime: '2099-01-01T00:00:00.000Z',
          },
        },
      },
    }));

    const result = await fetchAntigravityQuota({
      authSources: [makeSource('antigravity')],
      fetchModels,
      fetchQuotaBuckets: async () => ({ buckets: [] }),
    });

    expect(result.usage.models['antigravity/gemini-3-1-pro'].displayName).toBe('Gemini 3.1 Pro');
    expect(result.usage.models['antigravity/gemini-3-1-pro'].contextLabel).toBe('1M');
    expect(result.usage.models['antigravity/gemini-3-1-pro'].windows.daily.usedPercent).toBe(60);
  });
});
