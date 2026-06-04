import { describe, expect, test } from 'bun:test';

import { shouldShowSidebarFileRowActions } from './sidebarFilesTreeRuntime';

describe('shouldShowSidebarFileRowActions', () => {
  test('hides row actions in the browser runtime', () => {
    expect(shouldShowSidebarFileRowActions({
      platform: 'web',
      isDesktop: false,
      isVSCode: false,
    })).toBe(false);
  });

  test('keeps row actions in the desktop runtime', () => {
    expect(shouldShowSidebarFileRowActions({
      platform: 'desktop',
      isDesktop: true,
      isVSCode: false,
    })).toBe(true);
  });

  test('keeps row actions in the VS Code runtime', () => {
    expect(shouldShowSidebarFileRowActions({
      platform: 'vscode',
      isDesktop: false,
      isVSCode: true,
    })).toBe(true);
  });
});
