import { beforeEach, describe, expect, test } from 'bun:test';

import { useUIStore } from './useUIStore';

describe('useUIStore hidden model ref actions', () => {
  beforeEach(() => {
    useUIStore.setState({
      favoriteModels: [],
      favoriteModelsUpdatedAt: 0,
      hiddenModels: [],
      hiddenModelsUpdatedAt: 0,
    });
  });

  test('hides canonical refs without duplicating existing aliases', () => {
    const refs = [
      { providerID: 'antigravity', modelID: 'antigravity-claude-sonnet-4-6' },
      { providerID: 'google', modelID: 'antigravity-claude-sonnet-4-6' },
    ];

    useUIStore.setState({ hiddenModels: [refs[1]!] });
    useUIStore.getState().hideModelRefs([refs[0]!], refs);
    useUIStore.getState().hideModelRefs([refs[0]!], refs);

    expect(useUIStore.getState().hiddenModels).toEqual([refs[0]]);
  });

  test('removes every alias when showing model refs', () => {
    const refs = [
      { providerID: 'antigravity', modelID: 'antigravity-claude-sonnet-4-6' },
      { providerID: 'google', modelID: 'antigravity-claude-sonnet-4-6' },
    ];

    useUIStore.setState({
      hiddenModels: [
        refs[0]!,
        refs[1]!,
        { providerID: 'anthropic', modelID: 'claude-visible' },
      ],
    });

    useUIStore.getState().showModelRefs(refs);

    expect(useUIStore.getState().hiddenModels).toEqual([
      { providerID: 'anthropic', modelID: 'claude-visible' },
    ]);
  });

  test('stamps hidden model timestamps only when refs change', () => {
    const originalDateNow = Date.now;
    Date.now = () => 111;

    try {
      useUIStore.getState().hideModelRefs([{ providerID: 'anthropic', modelID: 'claude-hidden' }]);
      expect(useUIStore.getState().hiddenModelsUpdatedAt).toBe(111);

      Date.now = () => 222;
      useUIStore.getState().hideModelRefs([{ providerID: 'anthropic', modelID: 'claude-hidden' }]);
      expect(useUIStore.getState().hiddenModelsUpdatedAt).toBe(111);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test('stamps favorite model timestamps only when refs change', () => {
    const originalDateNow = Date.now;
    Date.now = () => 333;

    try {
      useUIStore.getState().toggleFavoriteModel('openai', 'gpt-5');
      expect(useUIStore.getState().favoriteModelsUpdatedAt).toBe(333);

      Date.now = () => 444;
      useUIStore.getState().reorderFavoriteModel('openai', 'gpt-5', 'openai', 'gpt-5');
      expect(useUIStore.getState().favoriteModelsUpdatedAt).toBe(333);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test('migration stamps non-empty legacy model lists', () => {
    const migrate = (useUIStore as unknown as {
      persist?: { getOptions?: () => { migrate?: (state: unknown, version: number) => unknown } };
    }).persist?.getOptions?.().migrate;
    expect(typeof migrate).toBe('function');

    const originalDateNow = Date.now;
    Date.now = () => 9876;

    try {
      const migrated = migrate?.({
        favoriteModels: [{ providerID: 'openai', modelID: 'gpt-5' }],
        hiddenModels: [],
      }, 8) as Record<string, unknown>;

      expect(migrated.favoriteModelsUpdatedAt).toBe(9876);
      expect(migrated.hiddenModelsUpdatedAt).toBe(0);
    } finally {
      Date.now = originalDateNow;
    }
  });
});
