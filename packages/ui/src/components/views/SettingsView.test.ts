import { describe, expect, test } from 'bun:test';
import { getSettingsNavButtonClassName, getSettingsPageSidebarClassName } from './SettingsView.styles';
import { resolveSettingsSlug } from '@/lib/settings/metadata';
import { SETTINGS_NAV_SECTIONS } from '@/lib/settings/navigation';

describe('SettingsView navigation', () => {
  test('settings sidebar page buttons fill the scrollable row without changing semantics', () => {
    const className = getSettingsNavButtonClassName(false);

    expect(className.split(/\s+/)).toContain('w-full');
    expect(className.split(/\s+/)).toContain('text-left');
  });

  test('skills settings list is wider than other split lists', () => {
    const defaultClassName = getSettingsPageSidebarClassName('agents');
    const skillsClassName = getSettingsPageSidebarClassName('skills.installed');

    expect(defaultClassName).toContain('w-[264px]');
    expect(defaultClassName).toContain('min-w-[264px]');
    expect(defaultClassName).toContain('max-w-[264px]');
    expect(skillsClassName).toContain('w-[334px]');
    expect(skillsClassName).toContain('min-w-[334px]');
    expect(skillsClassName).toContain('max-w-[334px]');
  });

  test('behavior is routed through agents instead of top-level navigation', () => {
    const topLevelSlugs = SETTINGS_NAV_SECTIONS.flatMap((section) => section.pages);

    expect(topLevelSlugs).not.toContain('behavior');
    expect(resolveSettingsSlug('behavior')).toBe('agents');
  });

  test('plugins sits between skills and magic prompts in workflow navigation', () => {
    const workflowPages = SETTINGS_NAV_SECTIONS
      .find((section) => section.labelKey === 'settings.view.nav.group.workflow')
      ?.pages ?? [];

    expect(resolveSettingsSlug('plugins')).toBe('plugins');
    expect(workflowPages).toContain('skills.installed');
    expect(workflowPages).toContain('plugins');
    expect(workflowPages).toContain('magic-prompts');
    expect(workflowPages.indexOf('plugins')).toBe(workflowPages.indexOf('skills.installed') + 1);
    expect(workflowPages.indexOf('magic-prompts')).toBe(workflowPages.indexOf('plugins') + 1);
  });
});
