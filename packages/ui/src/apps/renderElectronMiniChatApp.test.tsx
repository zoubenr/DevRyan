import { beforeEach, describe, expect, mock, test } from 'bun:test';

const calls: string[] = [];
let resolveSettingsSync: (() => void) | null = null;

mock.module('react-dom/client', () => ({
  createRoot: () => ({
    render: () => {
      calls.push('render');
    },
  }),
}));

mock.module('@/lib/i18n', () => ({
  initializeLocale: () => {
    calls.push('locale');
  },
  I18nProvider: ({ children }: { children: unknown }) => children,
}));

mock.module('@/lib/persistence', () => ({
  initializeAppearancePreferences: () => {
    calls.push('appearance');
    return Promise.resolve();
  },
  syncDesktopSettings: () => {
    calls.push('settings-start');
    return new Promise<void>((resolve) => {
      resolveSettingsSync = () => {
        calls.push('settings-finish');
        resolve();
      };
    });
  },
  updateDesktopSettings: async () => {},
}));

mock.module('@/lib/directoryPersistence', () => ({
  applyPersistedDirectoryPreferences: () => {
    calls.push('directory');
    return Promise.resolve();
  },
}));

mock.module('@/lib/appearanceAutoSave', () => ({
  startAppearanceAutoSave: () => {
    calls.push('appearance-autosave');
  },
}));

mock.module('@/lib/modelPrefsAutoSave', () => ({
  startModelPrefsAutoSave: () => {
    calls.push('model-autosave');
  },
}));

mock.module('@/lib/typographyWatcher', () => ({
  startTypographyWatcher: () => {
    calls.push('typography');
  },
}));

mock.module('@/components/auth/SessionAuthGate', () => ({
  SessionAuthGate: ({ children }: { children: unknown }) => children,
}));

mock.module('@/components/providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
}));

mock.module('@/contexts/ThemeSystemContext', () => ({
  ThemeSystemProvider: ({ children }: { children: unknown }) => children,
}));

mock.module('./ElectronMiniChatApp', () => ({
  ElectronMiniChatApp: () => null,
}));

const { renderElectronMiniChatApp } = await import('./renderElectronMiniChatApp');

describe('renderElectronMiniChatApp preferences startup', () => {
  beforeEach(() => {
    calls.length = 0;
    resolveSettingsSync = null;
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === 'root' ? {} : null),
    };
  });

  test('starts model preference autosave only after initial settings sync settles', async () => {
    renderElectronMiniChatApp({} as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toContain('settings-start');
    expect(calls).not.toContain('model-autosave');

    resolveSettingsSync?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toContain('model-autosave');
    expect(calls.indexOf('model-autosave')).toBeGreaterThan(calls.indexOf('settings-finish'));
  });
});
