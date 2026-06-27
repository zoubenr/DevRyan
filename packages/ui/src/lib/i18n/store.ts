import { create } from 'zustand';

import { dict as enDict, type I18nKey } from './messages/en';
import { DEFAULT_LOCALE, detectInitialLocale, normalizeLocale, type Locale, writeStoredLocale } from './runtime';

export type I18nParams = Record<string, string | number | boolean | null | undefined>;
export type I18nDictionary = Record<I18nKey, string>;

type I18nState = {
  locale: Locale;
  dictionary: I18nDictionary;
  loadingLocale: Locale | null;
  setLocale: (locale: Locale | string | null | undefined) => void;
};

export const useI18nStore = create<I18nState>()((set, get) => ({
  locale: DEFAULT_LOCALE,
  dictionary: enDict,
  loadingLocale: null,
  setLocale: (requestedLocale) => {
    const locale = normalizeLocale(requestedLocale);
    const current = get();
    if (current.locale === locale && current.loadingLocale !== locale) {
      return;
    }

    writeStoredLocale(locale);
    set({
      locale,
      dictionary: enDict,
      loadingLocale: null,
    });
  },
}));

export function initializeLocale(): void {
  useI18nStore.getState().setLocale(detectInitialLocale());
}

export function formatMessage(dictionary: I18nDictionary, key: I18nKey, params?: I18nParams): string {
  const template = dictionary[key] ?? enDict[key] ?? key;
  if (!params) {
    return template;
  }

  return template.replace(/\{([^{}]+)\}/g, (match, rawKey) => {
    const value = params[rawKey.trim()];
    return value === null || value === undefined ? match : String(value);
  });
}

export type { I18nKey, Locale };
