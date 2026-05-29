import { describe, expect, test } from 'bun:test';
import {
  filterHiddenProviderModels,
  isHiddenModelRef,
  type HiddenModelRef,
} from './modelVisibility';

describe('model visibility helpers', () => {
  const hiddenModels: HiddenModelRef[] = [
    { providerID: 'anthropic', modelID: 'claude-hidden' },
  ];

  test('detects hidden model refs by provider and model id', () => {
    expect(isHiddenModelRef(hiddenModels, 'anthropic', 'claude-hidden')).toBe(true);
    expect(isHiddenModelRef(hiddenModels, 'anthropic', 'claude-visible')).toBe(false);
    expect(isHiddenModelRef(hiddenModels, 'openai', 'claude-hidden')).toBe(false);
  });

  test('does not match empty provider or model ids', () => {
    expect(isHiddenModelRef(hiddenModels, '', 'claude-hidden')).toBe(false);
    expect(isHiddenModelRef(hiddenModels, 'anthropic', '')).toBe(false);
    expect(isHiddenModelRef(hiddenModels, undefined, 'claude-hidden')).toBe(false);
    expect(isHiddenModelRef(hiddenModels, 'anthropic', undefined)).toBe(false);
  });

  test('filters only hidden models from matching providers', () => {
    const filtered = filterHiddenProviderModels([
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-visible', name: 'Claude Visible' },
          { id: 'claude-hidden', name: 'Claude Hidden' },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'claude-hidden', name: 'Different Provider Same Model ID' },
        ],
      },
    ], hiddenModels);

    expect(filtered.map((provider) => ({
      id: provider.id,
      models: provider.models.map((model) => model.id),
    }))).toEqual([
      { id: 'anthropic', models: ['claude-visible'] },
      { id: 'openai', models: ['claude-hidden'] },
    ]);
  });

  test('removes providers when all models are hidden', () => {
    const filtered = filterHiddenProviderModels([
      {
        id: 'anthropic',
        models: [{ id: 'claude-hidden', name: 'Claude Hidden' }],
      },
    ], hiddenModels);

    expect(filtered).toEqual([]);
  });

  test('applies an additional model predicate after hidden filtering', () => {
    const filtered = filterHiddenProviderModels([
      {
        id: 'anthropic',
        models: [
          { id: 'claude-visible', name: 'Claude Visible' },
          { id: 'claude-fast', name: 'Claude Fast' },
        ],
      },
    ], hiddenModels, (_provider, _model, modelID) => !modelID.endsWith('-fast'));

    expect(filtered[0]?.models.map((model) => model.id)).toEqual(['claude-visible']);
  });
});
