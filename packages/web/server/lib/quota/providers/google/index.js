/**
 * Google Provider
 *
 * Google quota provider implementation.
 * @module quota/providers/google
 */

export {
  resolveGoogleOAuthClient,
  resolveGeminiCliAuth,
  resolveAntigravityAuth,
  resolveGoogleAuthSources,
  DEFAULT_PROJECT_ID
} from './auth.js';

export {
  resolveGoogleWindow,
  transformQuotaBucket,
  transformModelData
} from './transforms.js';

export {
  refreshGoogleAccessToken,
  fetchGoogleQuotaBuckets,
  fetchGoogleModels
} from './api.js';

import { buildResult, toUsageWindow } from '../../utils/index.js';
import {
  resolveGoogleAuthSources,
  resolveGoogleOAuthClient,
  DEFAULT_PROJECT_ID
} from './auth.js';
import { resolveGoogleWindow, transformQuotaBucket, transformModelData } from './transforms.js';
import {
  refreshGoogleAccessToken,
  fetchGoogleQuotaBuckets,
  fetchGoogleModels
} from './api.js';
import {
  ANTIGRAVITY_USAGE_MODELS,
  resolveAntigravityUsageModel
} from './antigravity-models.js';

const hasNumericUsage = (window) => (
  typeof window?.usedPercent === 'number' && Number.isFinite(window.usedPercent)
);

const shouldReplaceSummaryWindow = (currentWindow, nextWindow) => {
  if (!currentWindow) {
    return true;
  }

  const currentHasUsage = hasNumericUsage(currentWindow);
  const nextHasUsage = hasNumericUsage(nextWindow);
  if (nextHasUsage !== currentHasUsage) {
    return nextHasUsage;
  }

  if (nextHasUsage && nextWindow.usedPercent !== currentWindow.usedPercent) {
    return nextWindow.usedPercent > currentWindow.usedPercent;
  }

  const currentResetAt = typeof currentWindow.resetAt === 'number' ? currentWindow.resetAt : Number.POSITIVE_INFINITY;
  const nextResetAt = typeof nextWindow.resetAt === 'number' ? nextWindow.resetAt : Number.POSITIVE_INFINITY;
  return nextResetAt < currentResetAt;
};

const buildAntigravitySummaryWindows = (models) => {
  const windows = {};

  for (const modelUsage of Object.values(models)) {
    for (const [label, window] of Object.entries(modelUsage?.windows ?? {})) {
      if (shouldReplaceSummaryWindow(windows[label], window)) {
        windows[label] = { ...window };
      }
    }
  }

  return windows;
};

const buildAntigravityUsageModels = (rawModels) => {
  const modelsByCatalogId = new Map();

  for (const [modelName, modelData] of Object.entries(rawModels ?? {})) {
    const catalogModel = resolveAntigravityUsageModel(modelName, modelData);
    if (!catalogModel) {
      continue;
    }

    const transformed = transformModelData(catalogModel.id, modelData, 'antigravity');
    const usage = transformed?.[`antigravity/${catalogModel.id}`];
    if (!usage) {
      continue;
    }

    modelsByCatalogId.set(catalogModel.id, {
      ...usage,
      displayName: catalogModel.displayName,
      contextLabel: catalogModel.contextLabel,
      sortOrder: catalogModel.sortOrder,
    });
  }

  const firstExistingWindow = Array.from(modelsByCatalogId.values())
    .flatMap((usage) => Object.entries(usage.windows ?? {}))
    .find(([, window]) => typeof window?.windowSeconds === 'number');
  const fallbackWindow = resolveGoogleWindow('antigravity', null);
  const placeholderWindowLabel = firstExistingWindow?.[0] ?? fallbackWindow.label;
  const placeholderWindowSeconds = firstExistingWindow?.[1]?.windowSeconds ?? fallbackWindow.seconds;
  const placeholderResetAt = firstExistingWindow?.[1]?.resetAt ?? null;

  return Object.fromEntries(
    ANTIGRAVITY_USAGE_MODELS
      .map((catalogModel) => {
        const existingUsage = modelsByCatalogId.get(catalogModel.id);
        const usage = existingUsage ?? {
          windows: {
            [placeholderWindowLabel]: toUsageWindow({
              usedPercent: 0,
              windowSeconds: placeholderWindowSeconds,
              resetAt: placeholderResetAt,
            }),
          },
        };

        return [`antigravity/${catalogModel.id}`, {
          ...usage,
          displayName: catalogModel.displayName,
          contextLabel: catalogModel.contextLabel,
          sortOrder: catalogModel.sortOrder,
        }];
      })
  );
};

const fetchGoogleQuotaForSource = async ({
  sourceId,
  providerId,
  providerName,
  authSources = resolveGoogleAuthSources(),
  refreshAccessToken = refreshGoogleAccessToken,
  fetchQuotaBuckets = fetchGoogleQuotaBuckets,
  fetchModels = fetchGoogleModels
} = {}) => {
  const matchingSources = authSources.filter((source) => source.sourceId === sourceId);
  if (!matchingSources.length) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  const models = {};
  const sourceErrors = [];

  for (const source of matchingSources) {
    const now = Date.now();
    let accessToken = source.accessToken;

    if (!accessToken || (typeof source.expires === 'number' && source.expires <= now)) {
      if (!source.refreshToken) {
        sourceErrors.push(`${source.sourceLabel}: Missing refresh token`);
        continue;
      }
      const { clientId, clientSecret } = resolveGoogleOAuthClient(source.sourceId);
      accessToken = await refreshAccessToken(source.refreshToken, clientId, clientSecret, source.sourceId);
    }

    if (!accessToken) {
      sourceErrors.push(`${source.sourceLabel}: Failed to refresh OAuth token`);
      continue;
    }

    const projectId = source.projectId ?? DEFAULT_PROJECT_ID;
    let mergedAnyModel = false;

    if (source.sourceId === 'gemini') {
      const quotaPayload = await fetchQuotaBuckets(accessToken, projectId, source.sourceId);
      const buckets = Array.isArray(quotaPayload?.buckets) ? quotaPayload.buckets : [];

      for (const bucket of buckets) {
        const transformed = transformQuotaBucket(bucket, source.sourceId);
        if (transformed) {
          Object.assign(models, transformed);
          mergedAnyModel = true;
        }
      }
    }

    const payload = await fetchModels(accessToken, projectId, source.sourceId);
    if (payload) {
      if (source.sourceId === 'antigravity') {
        const transformed = buildAntigravityUsageModels(payload.models);
        Object.assign(models, transformed);
        mergedAnyModel = Object.keys(transformed).length > 0 || mergedAnyModel;
      } else {
        for (const [modelName, modelData] of Object.entries(payload.models ?? {})) {
          const transformed = transformModelData(modelName, modelData, source.sourceId);
          Object.assign(models, transformed);
          mergedAnyModel = true;
        }
      }
    }

    if (!mergedAnyModel) {
      sourceErrors.push(`${source.sourceLabel}: Failed to fetch models`);
    }
  }

  if (!Object.keys(models).length) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: sourceErrors[0] ?? 'Failed to fetch models'
    });
  }

  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage: {
      windows: providerId === 'antigravity' ? buildAntigravitySummaryWindows(models) : {},
      models: Object.keys(models).length ? models : undefined
    }
  });
};

export const fetchGoogleQuota = async (options = {}) => fetchGoogleQuotaForSource({
  ...options,
  sourceId: 'gemini',
  providerId: 'google',
  providerName: 'Google'
});

export const fetchAntigravityQuota = async (options = {}) => fetchGoogleQuotaForSource({
  ...options,
  sourceId: 'antigravity',
  providerId: 'antigravity',
  providerName: 'Antigravity'
});
