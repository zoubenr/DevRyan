import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, 'SyncActions.tsx'), 'utf8');

describe('SyncActions pull action', () => {
  test('keeps pull clickable so Git can discover remote changes even when cached behind count is stale', () => {
    const code = source();

    expect(code).toContain('const isPullDisabled = isRemoteActionDisabled;');
    expect(code).not.toContain('behindCount <= 0');
    expect(code).not.toContain('const isPullDisabled = isRemoteActionDisabled || blocksRebaseSync');
  });
});
