import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type SystemInfoResponse = {
  devShutdownAllowed?: boolean;
};

export const DevShutdownMenuItem: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useI18n();
  const [allowed, setAllowed] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/system/info');
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as SystemInfoResponse;
        if (!cancelled) {
          setAllowed(data.devShutdownAllowed === true);
        }
      } catch {
        // ignore
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirm = React.useCallback(async () => {
    if (isStopping) {
      return;
    }
    setIsStopping(true);
    try {
      const response = await fetch('/api/system/dev-shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewUrls: [] }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : t('header.services.shutdownDevFailed');
        toast.error(message);
        return;
      }
      toast.success(t('header.services.shutdownDevStopping'));
      setConfirmOpen(false);
    } catch {
      toast.error(t('header.services.shutdownDevFailed'));
    } finally {
      setIsStopping(false);
    }
  }, [isStopping, t]);

  if (!allowed) {
    return null;
  }

  return (
    <>
      <div className={cn('border-t border-[var(--interactive-border)] px-4 py-3', className)}>
        <button
          type="button"
          className={cn(
            'w-full rounded-md px-3 py-2 text-left typography-ui-label transition-colors',
            'text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
          onClick={() => setConfirmOpen(true)}
        >
          {t('header.services.shutdownDev')}
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('header.services.shutdownDevConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('header.services.shutdownDevConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isStopping}>
              {t('sessions.sidebar.dialogs.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={isStopping}>
              {t('header.services.shutdownDev')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
