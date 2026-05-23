import type { Theme } from '@/types/theme';
import { withPrColors } from './prColors';

import carbonfox_dark_Raw from './carbonfox-dark.json';
import carbonfox_light_Raw from './carbonfox-light.json';
import onedarkpro_dark_Raw from './onedarkpro-dark.json';
import onedarkpro_light_Raw from './onedarkpro-light.json';
import gruvbox_dark_Raw from './gruvbox-dark.json';
import gruvbox_light_Raw from './gruvbox-light.json';

export const presetThemes: Theme[] = [
  carbonfox_dark_Raw as Theme,
  carbonfox_light_Raw as Theme,
  onedarkpro_dark_Raw as Theme,
  onedarkpro_light_Raw as Theme,
  gruvbox_dark_Raw as Theme,
  gruvbox_light_Raw as Theme,
].map((theme) => withPrColors(theme));
