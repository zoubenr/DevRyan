import React from 'react';
import { toast } from '@/components/ui';
import { isWebRuntime } from '@/lib/desktop';
import { usePwaDetection } from '@/hooks/usePwaDetection';
import { useI18n } from '@/lib/i18n';
import { getSafeSessionStorage, getSafeStorage } from '@/stores/utils/safeStorage';
import {
  PWA_INSTALL_TOAST_DISMISSED_KEY,
  PWA_INSTALL_TOAST_SESSION_KEY,
  shouldShowPwaInstallToast,
} from './pwaInstallPromptDecision';

type InstallPromptOutcome = 'accepted' | 'dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallPromptOutcome }>;
};

export const usePwaInstallPrompt = () => {
  const { browserTab } = usePwaDetection();
  const { t } = useI18n();
  const tRef = React.useRef(t);

  React.useEffect(() => {
    tRef.current = t;
  }, [t]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !isWebRuntime() || !browserTab) {
      return;
    }

    let deferredPrompt: BeforeInstallPromptEvent | null = null;
    let installToastId: string | number | null = null;

    const dismissInstallToast = () => {
      if (installToastId === null) {
        return;
      }
      toast.dismiss(installToastId);
      installToastId = null;
    };

    const persistDismissal = () => {
      getSafeStorage().setItem(PWA_INSTALL_TOAST_DISMISSED_KEY, 'true');
      dismissInstallToast();
    };

    const triggerInstall = async () => {
      if (!deferredPrompt) {
        return;
      }

      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      dismissInstallToast();

      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        toast.success(tRef.current('pwa.installPrompt.started'));
      }
    };

    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      if (typeof installEvent.prompt !== 'function') {
        return;
      }

      installEvent.preventDefault();
      deferredPrompt = installEvent;

      const persistentStorage = getSafeStorage();
      const sessionStorage = getSafeSessionStorage();
      if (!shouldShowPwaInstallToast({
        persistentDismissedValue: persistentStorage.getItem(PWA_INSTALL_TOAST_DISMISSED_KEY),
        sessionShownValue: sessionStorage.getItem(PWA_INSTALL_TOAST_SESSION_KEY),
        hasActiveToast: installToastId !== null,
      })) {
        return;
      }

      sessionStorage.setItem(PWA_INSTALL_TOAST_SESSION_KEY, 'true');

      installToastId = toast.info(tRef.current('pwa.installPrompt.description'), {
        duration: Infinity,
        action: {
          label: tRef.current('pwa.installPrompt.action'),
          onClick: () => {
            void triggerInstall();
          },
        },
        cancel: {
          label: tRef.current('pwa.installPrompt.dismiss'),
          onClick: persistDismissal,
        },
      });
    };

    const onAppInstalled = () => {
      deferredPrompt = null;
      dismissInstallToast();
      toast.success(tRef.current('pwa.installPrompt.installed'));
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      dismissInstallToast();
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [browserTab]);
};
