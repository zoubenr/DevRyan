import { beforeEach, describe, expect, mock, test } from 'bun:test';

const savedSettings: Array<{
  favoriteModels?: Array<{ providerID: string; modelID: string }>;
  hiddenModels?: Array<{ providerID: string; modelID: string }>;
}> = [];

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: mock(async (changes: {
    favoriteModels?: Array<{ providerID: string; modelID: string }>;
    hiddenModels?: Array<{ providerID: string; modelID: string }>;
  }) => {
    savedSettings.push(changes);
  }),
}));

mock.module('@/lib/desktop', () => ({
  isVSCodeRuntime: () => false,
}));

const { startModelPrefsAutoSave } = await import('./modelPrefsAutoSave');
const { useUIStore } = await import('@/stores/useUIStore');

describe('startModelPrefsAutoSave', () => {
  beforeEach(() => {
    savedSettings.length = 0;
    useUIStore.setState({
      favoriteModels: [],
      hiddenModels: [],
    });
  });

  test('persists the first hidden model change after startup', async () => {
    (globalThis as Record<string, unknown>).window = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    const stopAutoSave = startModelPrefsAutoSave();

    try {
      useUIStore.getState().toggleHiddenModel('anthropic', 'claude-hidden');
      await new Promise((resolve) => setTimeout(resolve, 1250));

      expect(savedSettings).toEqual([
        {
          favoriteModels: [],
          hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-hidden' }],
        },
      ]);
    } finally {
      stopAutoSave();
      (globalThis as Record<string, unknown>).window = undefined;
    }
  });
});
