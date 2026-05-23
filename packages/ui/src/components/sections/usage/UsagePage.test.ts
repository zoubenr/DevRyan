import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = (fileName: string) => readFileSync(resolve(testDir, fileName), 'utf8');

describe('UsagePage model rows', () => {
  test('shows model names as model row titles while keeping window labels for calculations', () => {
    const cardSource = source('UsageCard.tsx');
    const pageSource = source('UsagePage.tsx');

    expect(cardSource).toContain('displayTitle?: string');
    expect(pageSource).toContain('displayTitle={modelDisplay.displayName}');
    expect(pageSource).toContain('subtitle={modelDisplay.contextLabel}');
  });

  test('renders optional usage window descriptions below usage titles', () => {
    const cardSource = source('UsageCard.tsx');

    expect(cardSource).toContain('description?: string');
    expect(cardSource).toContain('window.description');
  });

  test('hides provider-level summary windows for Antigravity usage', () => {
    const pageSource = source('UsagePage.tsx');

    expect(pageSource).toContain("selectedProviderId !== 'antigravity'");
  });

  test('keeps Cursor selectable in Usage while its usage token is missing', () => {
    const pageSource = source('UsagePage.tsx');
    const sidebarSource = source('UsageSidebar.tsx');

    expect(pageSource).toContain("selectedProviderId === 'cursor-acp'");
    expect(sidebarSource).toContain("provider.id === 'cursor-acp'");
    expect(sidebarSource).toContain('configuredByProviderId.has(provider.id)');
  });

  test('renders Antigravity model rows as a flat selected model list', () => {
    const pageSource = source('UsagePage.tsx');

    expect(pageSource).toContain("selectedProviderId === 'antigravity'");
    expect(pageSource).toContain('renderModelCard(model)');
    expect(pageSource).toContain('providerModels.map((model) => renderModelCard(model))');
  });
});
