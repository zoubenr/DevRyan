import type { Theme } from '@/types/theme';
import { presetThemes } from './presets';

export const DEFAULT_LIGHT_THEME_ID = 'onedarkpro-light' as const;
export const DEFAULT_DARK_THEME_ID = 'carbonfox-dark' as const;

export const themes: Theme[] = [...presetThemes];

export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

export function getDefaultTheme(prefersDark: boolean): Theme {
  const variant: Theme['metadata']['variant'] = prefersDark ? 'dark' : 'light';

  const defaultId = prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
  const defaultTheme = getThemeById(defaultId);
  if (defaultTheme && defaultTheme.metadata.variant === variant) {
    return defaultTheme;
  }

  return themes.find((theme) => theme.metadata.variant === variant) ?? themes[0];
}
