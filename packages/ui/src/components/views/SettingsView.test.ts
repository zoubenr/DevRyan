import { describe, expect, test } from 'bun:test';
import {
  getSettingsBackButtonClassName,
  getSettingsFullPageOverlayClassName,
  getSettingsNavButtonClassName,
  getSettingsPageSidebarClassName,
} from './SettingsView.styles';
import { resolveSettingsSlug } from '@/lib/settings/metadata';
import { SETTINGS_NAV_SECTIONS } from '@/lib/settings/navigation';

describe('SettingsView navigation', () => {
  test('settings sidebar page buttons fill the scrollable row without changing semantics', () => {
    const className = getSettingsNavButtonClassName(false);

    expect(className.split(/\s+/)).toContain('w-full');
    expect(className.split(/\s+/)).toContain('text-left');
  });

  test('settings full-page overlay covers the app shell without dialog styling', () => {
    const className = getSettingsFullPageOverlayClassName();
    const classes = className.split(/\s+/);

    expect(classes).toContain('absolute');
    expect(classes).toContain('inset-0');
    expect(classes).toContain('z-20');
    expect(classes).toContain('bg-background');
    expect(classes).not.toContain('rounded-xl');
    expect(classes).not.toContain('shadow-none');
  });

  test('settings back button is positioned as the full-page top-left control', () => {
    const className = getSettingsBackButtonClassName();
    const classes = className.split(/\s+/);

    expect(classes).toContain('absolute');
    expect(classes).toContain('left-3');
    expect(classes).toContain('top-3');
    expect(classes).toContain('z-50');
  });

  test('settings back button avoids macOS desktop traffic lights', () => {
    const className = getSettingsBackButtonClassName({ avoidMacTrafficLights: true });
    const classes = className.split(/\s+/);

    expect(classes).toContain('absolute');
    expect(classes).toContain('left-[5.5rem]');
    expect(classes).not.toContain('left-3');
    expect(classes).toContain('top-3');
    expect(classes).toContain('z-50');
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
