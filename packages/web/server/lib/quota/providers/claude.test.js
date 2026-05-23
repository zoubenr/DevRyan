import { describe, expect, it, vi } from 'vitest';

import { fetchClaudeQuota, isAnthropicOAuthProxyOptions } from './claude.js';
import { CLAUDE_CODE_STATUS_LINE_CUSTOM_CODE } from './claude-code-status-setup.js';
import { CLAUDE_CODE_REFRESH_FAILED_CODE } from './claude-code-status-refresh.js';

describe('fetchClaudeQuota', () => {
  it('uses Claude Code status usage when proxy config exists without direct OAuth tokens', async () => {
    const readStatusUsage = vi.fn(() => ({
      ok: true,
      usage: { windows: { '5h': { usedPercent: 33 }, '7d': { usedPercent: 44 } } },
    }));

    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: true }),
      readStatusUsage,
    });

    expect(readStatusUsage).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(33);
    expect(result.usage.windows['7d'].usedPercent).toBe(44);
  });

  it('returns pending guidance after setup when Claude Code has not emitted usage yet', async () => {
    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: true }),
      readStatusUsage: () => ({ ok: false, error: 'not emitted' }),
      refreshStatusUsage: () => ({ ok: false, code: CLAUDE_CODE_REFRESH_FAILED_CODE, error: 'Claude CLI failed' }),
    });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.errorCode).toBe(CLAUDE_CODE_REFRESH_FAILED_CODE);
    expect(result.error).toBe('Claude CLI failed');
  });

  it('refreshes usage with the Claude CLI before returning a pending status', async () => {
    const readStatusUsage = vi.fn()
      .mockReturnValueOnce({ ok: false, error: 'not emitted' })
      .mockReturnValueOnce({ ok: true, usage: { windows: { '5h': { usedPercent: 51 }, '7d': { usedPercent: 61 } } } });
    const refreshStatusUsage = vi.fn(() => ({ ok: true }));

    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: true }),
      readStatusUsage,
      refreshStatusUsage,
    });

    expect(refreshStatusUsage).toHaveBeenCalledTimes(1);
    expect(readStatusUsage).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(51);
    expect(result.usage.windows['7d'].usedPercent).toBe(61);
  });

  it('forces a Claude Code status refresh before reading cached usage', async () => {
    const readStatusUsage = vi.fn(() => ({
      ok: true,
      usage: { windows: { '5h': { usedPercent: 52 }, '7d': { usedPercent: 62 }, monthly: { usedPercent: 12 } } },
    }));
    const refreshStatusUsage = vi.fn(() => ({ ok: true }));

    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: true }),
      readStatusUsage,
      refreshStatusUsage,
      forceRefresh: true,
    });

    expect(refreshStatusUsage).toHaveBeenCalledTimes(1);
    expect(readStatusUsage).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(52);
    expect(result.usage.windows['7d'].usedPercent).toBe(62);
    expect(result.usage.windows.monthly.usedPercent).toBe(12);
  });

  it('keeps readable cached Claude Code usage when forced refresh fails', async () => {
    const readStatusUsage = vi.fn(() => ({
      ok: true,
      usage: { windows: { '5h': { usedPercent: 53 }, '7d': { usedPercent: 63 }, monthly: { usedPercent: 13 } } },
    }));
    const refreshStatusUsage = vi.fn(() => ({
      ok: false,
      code: CLAUDE_CODE_REFRESH_FAILED_CODE,
      error: 'Claude CLI failed',
    }));

    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: true }),
      readStatusUsage,
      refreshStatusUsage,
      forceRefresh: true,
    });

    expect(refreshStatusUsage).toHaveBeenCalledTimes(1);
    expect(readStatusUsage).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(53);
    expect(result.usage.windows['7d'].usedPercent).toBe(63);
    expect(result.usage.windows.monthly.usedPercent).toBe(13);
  });

  it('returns manual setup guidance instead of overwriting custom Claude Code statusLine', async () => {
    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: false, code: CLAUDE_CODE_STATUS_LINE_CUSTOM_CODE, error: 'custom statusLine' }),
      readStatusUsage: () => ({ ok: false, error: 'not emitted' }),
    });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.errorCode).toBe(CLAUDE_CODE_STATUS_LINE_CUSTOM_CODE);
    expect(result.error).toBe('custom statusLine');
  });

  it('accepts valid status usage when a custom Claude Code statusLine has already been manually merged', async () => {
    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: false, code: CLAUDE_CODE_STATUS_LINE_CUSTOM_CODE, error: 'custom statusLine' }),
      readStatusUsage: () => ({ ok: true, usage: { windows: { '5h': { usedPercent: 15 }, '7d': { usedPercent: 25 } } } }),
    });

    expect(result.ok).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(15);
    expect(result.usage.windows['7d'].usedPercent).toBe(25);
  });

  it('preserves non-pending status read errors as provider errors', async () => {
    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => ({ ok: true }),
      readStatusUsage: () => ({ ok: false, error: 'Claude Code status-line usage file is not valid JSON.' }),
      refreshStatusUsage: () => ({ ok: false, code: CLAUDE_CODE_REFRESH_FAILED_CODE, error: 'Claude CLI failed' }),
    });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.errorCode).toBe(CLAUDE_CODE_REFRESH_FAILED_CODE);
    expect(result.error).toBe('Claude CLI failed');
  });

  it('returns not configured when neither OAuth token nor proxy config exists', async () => {
    const result = await fetchClaudeQuota({
      readAuth: () => ({}),
      hasProxyConfig: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.error).toBe('Not configured');
  });

  it('uses the Anthropic OAuth usage API when a direct OAuth token exists', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        five_hour: { utilization: 12, resets_at: '2026-01-01T01:00:00.000Z' },
        seven_day: { utilization: 56, resets_at: '2026-01-08T00:00:00.000Z' },
        seven_day_sonnet: { utilization: 34, resets_at: '2026-01-08T00:00:00.000Z' },
        seven_day_opus: { utilization: 78, resets_at: '2026-01-08T00:00:00.000Z' },
      }),
    }));

    const result = await fetchClaudeQuota({
      readAuth: () => ({ anthropic: { access: 'token-123' } }),
      hasProxyConfig: () => true,
      ensureStatusLineBridge: () => { throw new Error('should not configure bridge with direct token'); },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://api.anthropic.com/api/oauth/usage', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
    }));
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(12);
    expect(result.usage.windows['5h'].windowSeconds).toBe(5 * 60 * 60);
    expect(result.usage.windows['7d'].usedPercent).toBe(56);
    expect(result.usage.windows['7d'].windowSeconds).toBe(7 * 24 * 60 * 60);
    expect(result.usage.windows['7d-sonnet'].windowSeconds).toBe(7 * 24 * 60 * 60);
    expect(result.usage.windows['7d-opus'].windowSeconds).toBe(7 * 24 * 60 * 60);
  });
});

describe('isAnthropicOAuthProxyOptions', () => {
  it('accepts dynamic local opencode-with-claude proxy ports', () => {
    expect(isAnthropicOAuthProxyOptions({ baseURL: 'http://127.0.0.1:55201', apiKey: 'dummy' })).toBe(true);
    expect(isAnthropicOAuthProxyOptions({ baseURL: 'http://localhost:3456', apiKey: 'dummy' })).toBe(true);
  });

  it('rejects non-proxy Anthropic API key config', () => {
    expect(isAnthropicOAuthProxyOptions({ baseURL: 'https://api.anthropic.com', apiKey: 'sk-ant-key' })).toBe(false);
    expect(isAnthropicOAuthProxyOptions({ baseURL: 'http://127.0.0.1:55201', apiKey: 'sk-ant-key' })).toBe(false);
  });
});
