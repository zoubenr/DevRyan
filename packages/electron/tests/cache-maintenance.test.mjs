import assert from 'node:assert/strict';
import test from 'node:test';

import { clearElectronRuntimeCaches } from '../cache-maintenance.mjs';

test('Electron cache maintenance clears HTTP and code caches without storage data', async () => {
  const calls = [];
  const defaultSession = {
    clearCache: async () => {
      calls.push('clearCache');
    },
    clearCodeCaches: async (options) => {
      calls.push(['clearCodeCaches', options]);
    },
    clearStorageData: async () => {
      calls.push('clearStorageData');
    },
  };

  const result = await clearElectronRuntimeCaches({
    defaultSession,
    log: { warn: () => calls.push('warn') },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    'clearCache',
    ['clearCodeCaches', { urls: [] }],
  ]);
});

test('Electron cache maintenance reports cache failures without throwing', async () => {
  const warnings = [];
  const result = await clearElectronRuntimeCaches({
    defaultSession: {
      clearCache: async () => {
        throw new Error('disk busy');
      },
      clearCodeCaches: async () => {},
    },
    log: { warn: (...args) => warnings.push(args) },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /disk busy/);
  assert.equal(warnings.length, 1);
});
