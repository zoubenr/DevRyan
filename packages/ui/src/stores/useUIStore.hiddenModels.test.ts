import { beforeEach, describe, expect, test } from 'bun:test';

import { useUIStore } from './useUIStore';

describe('useUIStore hidden model ref actions', () => {
  beforeEach(() => {
    useUIStore.setState({ hiddenModels: [] });
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
});
