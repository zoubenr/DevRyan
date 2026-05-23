import React from 'react';
import { RiGitCommitLine, RiLoader4Line } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GeneratedCommitMessage } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';

export type GeneratedCommitPlanStatus = 'idle' | 'loading' | 'ready' | 'running' | 'blocked' | 'error';

interface GeneratedCommitPlanDialogProps {
  open: boolean;
  status: GeneratedCommitPlanStatus;
  commits: GeneratedCommitMessage[];
  message?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const GeneratedCommitPlanDialog: React.FC<GeneratedCommitPlanDialogProps> = ({
  open,
  status,
  commits,
  message,
  onOpenChange,
  onConfirm,
}) => {
  const { t } = useI18n();
  const isLoading = status === 'loading';
  const isRunning = status === 'running';
  const canConfirm = status === 'ready' && commits.length > 0;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (isRunning) {
        return;
      }
      onOpenChange(nextOpen);
    },
    [isRunning, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RiGitCommitLine className="size-4 text-muted-foreground" />
            {t('gitView.generatedCommitPlan.title')}
          </DialogTitle>
          <DialogDescription>
            {t('gitView.generatedCommitPlan.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading || isRunning ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-surface-elevated p-4 text-center">
              <RiLoader4Line className="size-5 animate-spin text-muted-foreground" />
              <p className="typography-ui-label text-foreground">
                {isRunning
                  ? t('gitView.generatedCommitPlan.running')
                  : t('gitView.generatedCommitPlan.loading')}
              </p>
            </div>
          ) : status === 'blocked' || status === 'error' ? (
            <div className="rounded-lg border border-border/60 bg-surface-elevated p-3">
              <p className="typography-ui-label font-medium text-foreground">
                {status === 'blocked'
                  ? t('gitView.generatedCommitPlan.blockedTitle')
                  : t('gitView.generatedCommitPlan.errorTitle')}
              </p>
              {message ? (
                <p className="typography-meta mt-1 text-muted-foreground">{message}</p>
              ) : null}
            </div>
          ) : commits.length > 0 ? (
            commits.map((commit, index) => (
              <div key={`${commit.subject}-${index}`} className="rounded-lg border border-border/60 bg-surface-elevated p-3">
                <p className="typography-ui-label font-medium text-foreground">{commit.subject}</p>
                {commit.highlights.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {commit.highlights.map((highlight, highlightIndex) => (
                      <li key={`${highlight}-${highlightIndex}`} className="typography-meta text-muted-foreground">
                        {highlight}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border/60 bg-surface-elevated p-3">
              <p className="typography-meta text-muted-foreground">
                {t('gitView.generatedCommitPlan.empty')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isRunning}
          >
            {t('gitView.common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {t('gitView.generatedCommitPlan.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
