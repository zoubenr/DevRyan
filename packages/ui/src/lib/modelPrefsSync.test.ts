import { describe, expect, test } from 'bun:test';

import {
  createModelPrefsBaseline,
  getChangedModelPrefsKeys,
  modelPrefsEqual,
  resolveModelPrefsFromSettingsSnapshot,
  type ModelPrefsSnapshot,
} from './modelPrefsSync';

const emptyPrefs: ModelPrefsSnapshot = {
  favoriteModels: [],
  favoriteModelsUpdatedAt: 0,
  hiddenModels: [],
  hiddenModelsUpdatedAt: 0,
};

describe('modelPrefsSync', () => {
  test('preserves a locally hidden model when a stale settings snapshot arrives later', () => {
    const baseline = createModelPrefsBaseline(emptyPrefs);
    const current = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
      hiddenModelsUpdatedAt: 100,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline,
      current,
      incoming: emptyPrefs,
    })).toEqual(current);
  });

  test('applies returned settings when local model prefs did not change since baseline', () => {
    const baseline = createModelPrefsBaseline(emptyPrefs);
    const incoming = {
      favoriteModels: [{ providerID: 'openai', modelID: 'gpt-5' }],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
      hiddenModelsUpdatedAt: 0,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline,
      current: emptyPrefs,
      incoming,
    })).toEqual(incoming);
  });

  test('detects the first user hide after startup as a real model prefs change', () => {
    const baseline = createModelPrefsBaseline(emptyPrefs);
    const current = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
      hiddenModelsUpdatedAt: 100,
    };

    expect(getChangedModelPrefsKeys(baseline, current)).toEqual(['hiddenModels']);
    expect(modelPrefsEqual(baseline, current)).toBe(false);
  });

  test('keeps rehydrated local prefs when incoming legacy snapshot is empty and unstamped', () => {
    const local = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
      hiddenModelsUpdatedAt: 500,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline: createModelPrefsBaseline(local),
      current: local,
      incoming: emptyPrefs,
    })).toEqual(local);
  });

  test('uses newer incoming timestamps when local prefs are unchanged since baseline', () => {
    const baseline = createModelPrefsBaseline({
      favoriteModels: [],
      favoriteModelsUpdatedAt: 10,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'old-hidden' }],
      hiddenModelsUpdatedAt: 10,
    });
    const incoming = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 10,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'new-hidden' }],
      hiddenModelsUpdatedAt: 20,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline,
      current: baseline,
      incoming,
    })).toEqual(incoming);
  });

  test('uses newer local timestamps when incoming settings are older', () => {
    const local = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'local-hidden' }],
      hiddenModelsUpdatedAt: 20,
    };
    const incoming = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [],
      hiddenModelsUpdatedAt: 10,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline: createModelPrefsBaseline(local),
      current: local,
      incoming,
    })).toEqual(local);
  });

  test('keeps current hidden models when incoming settings have the same timestamp but stale contents', () => {
    const current = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'still-hidden' }],
      hiddenModelsUpdatedAt: 30,
    };
    const incoming = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [],
      hiddenModelsUpdatedAt: 30,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline: createModelPrefsBaseline(current),
      current,
      incoming,
    })).toEqual(current);
  });

  test('applies a newer explicit unhide from settings when local prefs are unchanged', () => {
    const current = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [{ providerID: 'anthropic', modelID: 'removed-hidden' }],
      hiddenModelsUpdatedAt: 30,
    };
    const incoming = {
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [],
      hiddenModelsUpdatedAt: 40,
    };

    expect(resolveModelPrefsFromSettingsSnapshot({
      baseline: createModelPrefsBaseline(current),
      current,
      incoming,
    })).toEqual(incoming);
  });
});
