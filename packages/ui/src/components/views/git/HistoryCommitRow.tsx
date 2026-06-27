import React from 'react';
import { RiLoader4Line } from '@remixicon/react';
import { cn } from '@/lib/utils';
import type { GitLogEntry, CommitFileEntry } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { resolveHistoryCommitBadges, resolveHistoryCommitIndicator } from './historyIndicator';

interface HistoryCommitRowProps {
  entry: GitLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  files: CommitFileEntry[];
  isLoadingFiles: boolean;
  onCopyHash?: (hash: string) => void;
  currentBranch?: string | null;
  trackingBranch?: string | null;
}

function getChangeTypeColor(changeType: string) {
  switch (changeType) {
    case 'A':
      return 'text-[var(--status-success)]';
    case 'D':
      return 'text-[var(--status-error)]';
    case 'M':
      return 'text-[var(--status-warning)]';
    case 'R':
      return 'text-[var(--status-info)]';
    default:
      return 'text-muted-foreground';
  }
}

export const HistoryCommitRow = React.memo(({
  entry,
  isExpanded,
  onToggle,
  files,
  isLoadingFiles,
  currentBranch,
  trackingBranch,
}: HistoryCommitRowProps) => {
  const { t } = useI18n();
  const indicator = resolveHistoryCommitIndicator(entry);
  const badges = resolveHistoryCommitBadges(entry, { currentBranch, trackingBranch });
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-start gap-3 px-2 py-2 text-left transition-colors',
          isExpanded ? 'bg-sidebar/90' : 'hover:bg-sidebar/40'
        )}
      >
        <span
          className="h-2 w-2 translate-y-2 rounded-full shrink-0"
          style={{
            backgroundColor: indicator.dotColor,
            ...(indicator.ringColor
              ? { boxShadow: `0 0 0 1.5px var(--sidebar), 0 0 0 3px ${indicator.ringColor}` }
              : null),
          }}
          role="img"
          aria-label={t(indicator.ariaLabelKey)}
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans typography-ui-label font-normal text-foreground line-clamp-1">
            {entry.message}
          </p>
          {badges.length > 0 ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              {badges.map((badge) => (
                <span
                  key={badge.key}
                  className={cn(
                    'inline-flex max-w-full items-center rounded-full border px-1.5 py-0.5 typography-micro leading-none',
                    badge.key === 'local'
                      ? 'border-border/70 bg-sidebar text-foreground'
                      : 'border-border/60 bg-sidebar/70 text-muted-foreground'
                  )}
                  title={t(badge.ariaLabelKey, { branch: badge.label })}
                  aria-label={t(badge.ariaLabelKey, { branch: badge.label })}
                >
                  <span className="truncate">{badge.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>

      {isExpanded && (
        <div className="px-2 pb-2 pl-7 border-t border-border/40">
          {isLoadingFiles ? (
            <div className="flex items-center gap-2 py-2">
              <RiLoader4Line className="size-4 animate-spin text-muted-foreground" />
              <span className="typography-micro text-muted-foreground">{t('gitView.history.loadingFiles')}</span>
            </div>
          ) : files.length === 0 ? (
            <p className="typography-micro text-muted-foreground py-2">{t('gitView.history.noFiles')}</p>
          ) : (
            <ul className="space-y-0.5 py-2">
              {files.map((file) => (
                <li
                  key={file.path}
                  className="flex items-center gap-2 typography-micro"
                >
                  <span
                    className={cn(
                      'font-semibold w-3 text-center',
                      getChangeTypeColor(file.changeType)
                    )}
                  >
                    {file.changeType}
                  </span>
                  <span className="truncate text-foreground min-w-0" title={file.path}>
                    {file.path}
                  </span>
                  {!file.isBinary && (
                    <span className="shrink-0">
                      <span style={{ color: 'var(--status-success)' }}>
                        +{file.insertions}
                      </span>
                      <span className="text-muted-foreground mx-0.5">/</span>
                      <span style={{ color: 'var(--status-error)' }}>
                        -{file.deletions}
                      </span>
                    </span>
                  )}
                  {file.isBinary && (
                    <span className="typography-micro text-muted-foreground shrink-0">
                      {t('gitView.history.binary')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
});
