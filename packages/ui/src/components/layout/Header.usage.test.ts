import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const headerSource = () => readFileSync(resolve(testDir, 'Header.tsx'), 'utf8');

describe('Header usage dropdown', () => {
  test('renders Antigravity as model-only usage rows', () => {
    const source = headerSource();

    expect(source).toContain("const isAntigravityProvider = provider.id === 'antigravity'");
    expect(source).toContain('const entries = isAntigravityProvider ? [] : Object.entries(windows)');
    expect(source).toContain('<ProviderLogo providerId={group.providerId} className="h-4 w-4" />');
    expect(source).toContain('group.modelRows.map');
  });
});
