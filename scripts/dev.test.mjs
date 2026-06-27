import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { shouldRestartDevChild } from './dev-restart-policy.mjs';

describe('shouldRestartDevChild', () => {
  test('restarts when not shutting down', () => {
    assert.equal(shouldRestartDevChild({ shuttingDown: false }), true);
  });

  test('does not restart while shutting down', () => {
    assert.equal(shouldRestartDevChild({ shuttingDown: true }), false);
  });
});
