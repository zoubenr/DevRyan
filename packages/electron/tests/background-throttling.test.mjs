import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '..', 'main.mjs'), 'utf8');

test('chat windows keep renderer timers active for packaged streaming responsiveness', () => {
  assert.equal(source.includes('backgroundThrottling: true'), false);
  assert.ok((source.match(/backgroundThrottling:\s*false/g) ?? []).length >= 2);
});
