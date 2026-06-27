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
  hiddenModels: [],
};

describe('modelPrefsSync', () => {
  test('preserves a locally hidden model when a stale settings snapshot arrives later', () => {
    const baseline = createModelPrefsBaseline(emptyPrefs);
    const current = {
      favoriteModels: [],
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
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
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
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
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
    };

    expect(getChangedModelPrefsKeys(baseline, current)).toEqual(['hiddenModels']);
    expect(modelPrefsEqual(baseline, current)).toBe(false);
  });
});
