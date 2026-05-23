import { describe, expect, test } from 'bun:test';

import {
  getDisplayProviderId,
  getExecutionProviderId,
  getModelDisplayName,
  splitAntigravityProviderForDisplay,
} from './antigravity';

describe('Antigravity provider display helpers', () => {
  test('detects Google Antigravity models and strips the display suffix', () => {
    const model = {
      id: 'antigravity-gemini-3.1-pro',
      providerID: 'google',
      name: 'Gemini 3.1 Pro (Antigravity)',
    };

    expect(getDisplayProviderId('google', model)).toBe('antigravity');
    expect(getExecutionProviderId('antigravity', model)).toBe('google');
    expect(getModelDisplayName(model)).toBe('Gemini 3.1 Pro');
  });

  test('does not strip Antigravity text from non-Antigravity Google models', () => {
    const model = {
      id: 'gemini-3-pro',
      providerID: 'google',
      name: 'Gemini 3 Pro',
    };

    expect(getDisplayProviderId('google', model)).toBe('google');
    expect(getModelDisplayName(model)).toBe('Gemini 3 Pro');
  });

  test('splits Google into Google and Antigravity display providers without changing execution ids', () => {
    const [google, antigravity] = splitAntigravityProviderForDisplay([
      {
        id: 'google',
        name: 'Google',
        models: [
          { id: 'gemini-3-pro', providerID: 'google', name: 'Gemini 3 Pro' },
          { id: 'antigravity-claude-sonnet-4-6', providerID: 'google', name: 'Claude Sonnet 4.6 (Antigravity)' },
        ],
      },
    ]);

    expect(google?.id).toBe('google');
    expect(google?.models.map((model) => model.id)).toEqual(['gemini-3-pro']);
    expect(antigravity?.id).toBe('antigravity');
    expect(antigravity?.name).toBe('Antigravity');
    expect(antigravity?.models.map((model) => ({
      id: model.id,
      providerID: model.providerID,
      name: model.name,
    }))).toEqual([
      {
        id: 'antigravity-claude-sonnet-4-6',
        providerID: 'google',
        name: 'Claude Sonnet 4.6',
      },
    ]);
  });
});
