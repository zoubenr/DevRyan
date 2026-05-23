import { readAuthFile } from '../../opencode/auth.js';
import {
  getAuthEntry,
  normalizeAuthEntry,
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
} from '../utils/index.js';

export const providerId = 'cursor-acp';
export const providerName = 'Cursor';
export const aliases = ['cursor-acp'];

const CURRENT_PERIOD_USAGE_URL = 'https://cursor.com/api/dashboard/get-current-period-usage';
const DASHBOARD_URL = 'https://cursor.com/dashboard?tab=spending';
const AUTO_COMPOSER_DESCRIPTION = 'Additional usage beyond limits consumes API quota or on-demand spend.';
const API_DESCRIPTION = 'Additional usage beyond limits consumes on-demand spend.';

export const getCursorUsageSessionToken = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const token = typeof entry?.usageSessionToken === 'string' ? entry.usageSessionToken.trim() : '';
  return token || null;
};

export const getCursorUsageSessionTokenCandidates = (sessionToken) => {
  const token = typeof sessionToken === 'string' ? sessionToken.trim() : '';
  if (!token) return [];

  const candidates = [token];
  const addCandidate = (candidate) => {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (token.includes('::')) {
    addCandidate(token.replaceAll('::', '%3A%3A'));
  }

  if (/%[0-9a-f]{2}/i.test(token)) {
    try {
      addCandidate(decodeURIComponent(token));
    } catch {
      // Keep the raw token when it is not valid URI-encoded text.
    }
  }

  return candidates;
};

export const isConfigured = ({ readAuth = readAuthFile } = {}) => {
  return Boolean(getCursorUsageSessionToken(readAuth()));
};

const resolveBillingWindowSeconds = (startAt, endAt) => {
  if (typeof startAt !== 'number' || typeof endAt !== 'number' || endAt <= startAt) {
    return null;
  }
  return Math.round((endAt - startAt) / 1000);
};

const buildCursorUsage = (payload) => {
  const plan = payload?.individualUsage?.plan ?? payload?.planUsage;
  if (!plan || typeof plan !== 'object') {
    throw new Error('Cursor usage response did not include plan usage buckets.');
  }

  const autoPercent = toNumber(plan.autoPercentUsed);
  const apiPercent = toNumber(plan.apiPercentUsed);
  if (autoPercent === null || apiPercent === null) {
    throw new Error('Cursor usage response did not include plan usage buckets.');
  }

  const billingCycleStart = toTimestamp(payload?.billingCycleStart);
  const billingCycleEnd = toTimestamp(payload?.billingCycleEnd);
  const windowSeconds = resolveBillingWindowSeconds(billingCycleStart, billingCycleEnd);

  const windows = {};
  windows['auto-composer'] = toUsageWindow({
    usedPercent: autoPercent,
    windowSeconds,
    resetAt: billingCycleEnd,
    description: AUTO_COMPOSER_DESCRIPTION,
  });
  windows.api = toUsageWindow({
    usedPercent: apiPercent,
    windowSeconds,
    resetAt: billingCycleEnd,
    description: API_DESCRIPTION,
  });

  return {
    windows,
  };
};

const buildCursorUsageRequests = (sessionToken) => [
  {
    url: CURRENT_PERIOD_USAGE_URL,
    init: {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Pragma: 'no-cache',
        Origin: 'https://cursor.com',
        Referer: DASHBOARD_URL,
        Cookie: `WorkosCursorSessionToken=${sessionToken}`,
      },
      body: '{}',
    },
  },
];

export const fetchCursorAcpQuota = async ({
  readAuth = readAuthFile,
  fetchImpl = globalThis.fetch,
} = {}) => {
  const sessionToken = getCursorUsageSessionToken(readAuth());
  if (!sessionToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Cursor usage tracking is not configured.',
    });
  }

  try {
    let response = null;
    for (const tokenCandidate of getCursorUsageSessionTokenCandidates(sessionToken)) {
      for (const request of buildCursorUsageRequests(tokenCandidate)) {
        response = await fetchImpl(request.url, request.init);
        if (response.ok) {
          break;
        }
      }
      if (response?.ok) {
        break;
      }
    }

    if (!response?.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: response?.status === 401
          ? 'Cursor session expired. Update the Cursor usage session token.'
          : `Cursor usage API error: ${response?.status ?? 'unknown'}`,
      });
    }

    const payload = await response.json();
    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: buildCursorUsage(payload),
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed',
    });
  }
};

export const fetchQuota = fetchCursorAcpQuota;
