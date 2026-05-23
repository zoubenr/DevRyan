import { describe, expect, test } from 'bun:test';

import { getModelSelectorDropdownClassName, getSelectedModelIndex } from './ModelSelector.utils';

describe('getSelectedModelIndex', () => {
  test('selects the matching favorite model index before provider models', () => {
    expect(getSelectedModelIndex(
      [
        { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
        { providerID: 'opencode', modelID: 'gpt-5.1-codex' },
      ],
      [
        { providerID: 'opencode', modelID: 'gpt-5.1-codex' },
        { providerID: 'openai', modelID: 'gpt-5.1' },
      ],
      'opencode',
      'gpt-5.1-codex',
    )).toBe(1);
  });

  test('selects the matching provider model after favorites', () => {
    expect(getSelectedModelIndex(
      [
        { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
      ],
      [
        { providerID: 'opencode', modelID: 'gpt-5.1-codex' },
        { providerID: 'openai', modelID: 'gpt-5.1' },
      ],
      'openai',
      'gpt-5.1',
    )).toBe(2);
  });

  test('falls back to the first row when no model is selected or visible', () => {
    expect(getSelectedModelIndex([], [], '', '')).toBe(0);
    expect(getSelectedModelIndex([], [], 'missing', 'model')).toBe(0);
  });
});

describe('getModelSelectorDropdownClassName', () => {
  test('constrains the dropdown to the available viewport width', () => {
    const className = getModelSelectorDropdownClassName();

    expect(className).toContain('var(--available-width)');
    expect(className).toContain('calc(100vw-2rem)');
    expect(className).toContain('var(--anchor-width)');
    expect(className).toContain('420px');
  });
});
