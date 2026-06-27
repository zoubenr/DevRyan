import { describe, expect, test } from 'bun:test';

import { fetchQuotaForProvider } from '../src/quotaProviders';

describe('VS Code Cursor ACP quota provider', () => {
  test('maps Cursor dashboard usage summary buckets to quota windows', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        billingCycleStart: '2026-04-02T14:11:55.000Z',
        billingCycleEnd: '2026-05-02T14:11:55.000Z',
        individualUsage: {
          plan: {
            totalPercentUsed: 86,
            autoPercentUsed: 82,
            apiPercentUsed: 100,
          },
        },
      }),
    });

    const result = await fetchQuotaForProvider('cursor-acp', {
      readAuth: () => ({ 'cursor-acp': { usageSessionToken: 'secret-token' } }),
      fetchImpl,
    });

    expect(result.providerId).toBe('cursor-acp');
    expect(result.providerName).toBe('Cursor');
    expect(result.ok).toBe(true);
    expect(result.usage?.windows.total).toBeUndefined();
    expect(result.usage?.windows['auto-composer'].usedPercent).toBe(82);
    expect(result.usage?.windows.api.usedPercent).toBe(100);
  });

  test('maps Cursor current-period dashboard buckets to quota windows', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        planUsage: {
          autoPercentUsed: 82,
          apiPercentUsed: 100,
        },
      }),
    });

    const result = await fetchQuotaForProvider('cursor-acp', {
      readAuth: () => ({ 'cursor-acp': { usageSessionToken: 'secret-token' } }),
      fetchImpl,
    });

    expect(result.providerId).toBe('cursor-acp');
    expect(result.providerName).toBe('Cursor');
    expect(result.ok).toBe(true);
    expect(result.usage?.windows.total).toBeUndefined();
    expect(result.usage?.windows['auto-composer'].usedPercent).toBe(82);
    expect(result.usage?.windows.api.usedPercent).toBe(100);
  });
});

describe('VS Code GitHub Copilot quota provider', () => {
  test('shows token-based billing quota as GitHub AI Credits', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        quota_reset_date_utc: '2026-07-01T00:00:00.000Z',
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: {
            entitlement: 7000,
            remaining: 5250,
          },
        },
      }),
    });

    const result = await fetchQuotaForProvider('github-copilot', {
      readAuth: () => ({ 'github-copilot': { access: 'copilot-token' } }),
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.usage?.windows.premium).toBeUndefined();
    expect(result.usage?.windows['ai-credits']).toMatchObject({
      usedPercent: 25,
      resetAt: Date.parse('2026-07-01T00:00:00.000Z'),
      valueLabel: '5250 / 7000 credits left',
      description: 'GitHub AI Credits are consumed from token usage, including input, output, and cached tokens.',
    });
  });

  test('keeps legacy premium request labeling for request-based quota payloads', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        quota_reset_date: '2026-07-01',
        quota_snapshots: {
          premium_interactions: {
            entitlement: 300,
            remaining: 225,
          },
        },
      }),
    });

    const result = await fetchQuotaForProvider('github-copilot', {
      readAuth: () => ({ 'github-copilot': { access: 'copilot-token' } }),
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.usage?.windows['ai-credits']).toBeUndefined();
    expect(result.usage?.windows.premium).toMatchObject({
      usedPercent: 25,
      valueLabel: '225 / 300 requests left',
    });
  });
});
