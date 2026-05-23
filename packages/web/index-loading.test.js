import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = () => readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8');
const siteManifest = () => JSON.parse(readFileSync(resolve(import.meta.dirname, 'public/site.webmanifest'), 'utf8'));

describe('initial loading splash', () => {
  it('uses a theme-aware logo stroke instead of a fixed dark icon', () => {
    const html = indexHtml();

    expect(html).toContain('--splash-logo-stroke');
    expect(html).toContain('stroke="var(--splash-logo-stroke)"');
    expect(html).not.toContain('stroke="#1e2a38"');
  });

  it('prevents document scrollbars while the initial loading splash is visible', () => {
    const html = indexHtml();

    expect(html).toContain('html,\n      body {');
    expect(html).toContain('margin: 0;');
    expect(html).toContain('overflow: hidden;');
    expect(html).toContain('position: fixed;');
    expect(html).toContain('inset: 0;');
  });
});

describe('web metadata branding', () => {
  it('uses DevRyan for the document title and install metadata', () => {
    const html = indexHtml();

    expect(html).toContain("const defaultAppName = 'DevRyan - AI Coding Assistant'");
    expect(html).toContain("const defaultShortName = 'DevRyan'");
    expect(html).toContain('<title>DevRyan - AI Coding Assistant</title>');
    expect(html).toContain('<meta name="application-name" content="DevRyan" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="DevRyan" />');
  });

  it('uses DevRyan for the static web manifest name fields', () => {
    const manifest = siteManifest();

    expect(manifest.name).toBe('DevRyan - AI Coding Companion');
    expect(manifest.short_name).toBe('DevRyan');
  });
});
