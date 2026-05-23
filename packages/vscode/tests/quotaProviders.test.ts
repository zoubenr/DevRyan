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
