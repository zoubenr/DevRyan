import { cn } from '@/lib/utils';
import type { SettingsPageSlug } from '@/lib/settings/metadata';

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
