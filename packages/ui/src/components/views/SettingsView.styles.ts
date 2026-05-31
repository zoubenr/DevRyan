import { cn } from '@/lib/utils';
import type { SettingsPageSlug } from '@/lib/settings/metadata';

export function getSettingsFullPageOverlayClassName(): string {
  return 'absolute inset-0 z-20 bg-background';
}

export function getSettingsBackButtonClassName({ avoidMacTrafficLights = false }: { avoidMacTrafficLights?: boolean } = {}): string {
  return cn(
    'absolute top-3 z-50',
    avoidMacTrafficLights ? 'left-[5.5rem]' : 'left-3',
    'inline-flex h-9 w-9 items-center justify-center rounded-lg p-2',
    'text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  );
}

export function getSettingsNavButtonClassName(selected: boolean): string {
  return cn(
    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left overflow-hidden',
    selected
      ? 'bg-interactive-selection text-foreground'
      : 'text-foreground hover:bg-interactive-hover'
  );
}

export function getSettingsPageSidebarClassName(slug: SettingsPageSlug): string {
  if (slug === 'skills.installed') {
    return 'w-[334px] min-w-[334px] max-w-[334px]';
  }

  return 'w-[264px] min-w-[264px] max-w-[264px]';
}
