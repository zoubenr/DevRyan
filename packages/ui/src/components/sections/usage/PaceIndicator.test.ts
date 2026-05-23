import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, 'PaceIndicator.tsx'), 'utf8');

describe('PaceIndicator', () => {
  test('uses muted foreground for zero-percent predictions', () => {
    const code = source();

    expect(code).toContain('isZeroPrediction');
    expect(code).toContain("'var(--muted-foreground)'");
  });
});
