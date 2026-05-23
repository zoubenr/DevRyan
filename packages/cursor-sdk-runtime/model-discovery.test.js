import { describe, expect, test } from 'bun:test';
import { createCursorSdkRuntime } from './index.js';

const createRuntimeForModels = (models) => createCursorSdkRuntime({
  env: { CURSOR_API_KEY: 'test-key' },
  readAuth: () => ({}),
  writeAuth: () => {},
  loadSdk: async () => ({
    Cursor: {
      models: {
        list: async () => models,
      },
    },
  }),
});

describe('Cursor SDK model discovery', () => {
  test('adds Composer 2.5 Fast compatibility row when SDK only returns Composer 2.5', async () => {
    const runtime = createRuntimeForModels([
      { id: 'composer-2.5', displayName: 'Composer 2.5' },
    ]);

    const provider = await runtime.getVirtualProvider();

    expect(provider.models['composer-2.5']).toEqual({
      id: 'composer-2.5',
      name: 'Composer 2.5',
    });
    expect(provider.models['composer-2.5-fast']).toEqual({
      id: 'composer-2.5-fast',
      name: 'Composer 2.5 Fast',
    });
  });

  test('does not overwrite SDK-returned Composer 2.5 Fast metadata', async () => {
    const runtime = createRuntimeForModels([
      { id: 'composer-2.5', displayName: 'Composer 2.5' },
      { id: 'composer-2.5-fast', displayName: 'Composer 2.5 Turbo' },
    ]);

    const provider = await runtime.getVirtualProvider();

    expect(provider.models['composer-2.5-fast']).toEqual({
      id: 'composer-2.5-fast',
      name: 'Composer 2.5 Turbo',
    });
  });

  test('uses full fallback list when SDK model discovery returns no models', async () => {
    const runtime = createRuntimeForModels([]);

    const provider = await runtime.getVirtualProvider();

    expect(provider.models['composer-2.5']).toBeDefined();
    expect(provider.models['composer-2.5-fast']).toBeDefined();
    expect(provider.models.auto).toBeDefined();
  });
});
