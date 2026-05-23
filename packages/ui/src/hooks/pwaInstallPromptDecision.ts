export interface PwaInstallToastDecisionInput {
  persistentDismissedValue: string | null;
  sessionShownValue: string | null;
  hasActiveToast: boolean;
}

export const PWA_INSTALL_TOAST_DISMISSED_KEY = 'pwa-install-toast-dismissed';
export const PWA_INSTALL_TOAST_SESSION_KEY = 'pwa-install-toast-shown';

export const shouldShowPwaInstallToast = ({
  persistentDismissedValue,
  sessionShownValue,
  hasActiveToast,
}: PwaInstallToastDecisionInput): boolean => {
  if (persistentDismissedValue === 'true') {
    return false;
  }
  if (sessionShownValue === 'true') {
    return false;
  }
  return !hasActiveToast;
};
