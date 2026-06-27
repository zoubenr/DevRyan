export type MobileStage = 'nav' | 'page-sidebar' | 'page-content';

export function resolveMobileSettingsBackStage(
  currentStage: MobileStage,
  activePageMeta: { kind: 'single' | 'split' } | null | undefined,
): MobileStage {
  if (currentStage === 'page-content' && activePageMeta?.kind === 'split') {
    return 'page-sidebar';
  }
  if (currentStage === 'page-sidebar') {
    return 'nav';
  }
  return 'nav';
}
