import React from 'react';
import { RiArrowDownSLine, RiArrowRightSLine, RiArrowUpLine } from '@remixicon/react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { HistoryCommitRow } from './HistoryCommitRow';
import type { GitLogEntry, CommitFileEntry } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface HistorySectionProps {
  log: { all: GitLogEntry[]; total?: number } | null;
  isLogLoading: boolean;
  onLoadMore?: () => void;
  expandedCommitHashes: Set<string>;
  onToggleCommit: (hash: string) => void;
  commitFilesMap: Map<string, CommitFileEntry[]>;
  loadingCommitHashes: Set<string>;
  onCopyHash: (hash: string) => void;
  showHeader?: boolean;
  contentMaxHeightClassName?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  toolbarSlot?: React.ReactNode;
  className?: string;
  currentBranch?: string | null;
  trackingBranch?: string | null;
  branchDivider?: {
    insertBeforeIndex: number;
    branchName: string;
    direction: 'up' | 'down';
  } | null;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  log,
  isLogLoading,
  onLoadMore,
  expandedCommitHashes,
  onToggleCommit,
  commitFilesMap,
  loadingCommitHashes,
  onCopyHash,
  showHeader = true,
  contentMaxHeightClassName = 'max-h-[50vh]',
  isOpen: controlledIsOpen,
  onOpenChange,
  toolbarSlot,
  className,
  currentBranch,
  trackingBranch,
  branchDivider = null,
}) => {
  const { t } = useI18n();
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(true);
  const lastLoadMoreLengthRef = React.useRef<number | null>(null);
  const isOpen = controlledIsOpen ?? uncontrolledIsOpen;
  const setIsOpen = React.useCallback(
    (next: boolean) => {
      if (controlledIsOpen === undefined) {
        setUncontrolledIsOpen(next);
      }
      onOpenChange?.(next);
    },
    [controlledIsOpen, onOpenChange]
  );

  const entries = log?.all ?? [];
  const hasMoreCommits = Boolean(log && typeof log.total === 'number' && entries.length < log.total);

  React.useEffect(() => {
    if (!isLogLoading) {
      lastLoadMoreLengthRef.current = null;
    }
  }, [isLogLoading]);

  const handleHistoryScroll = React.useCallback((event: React.UIEvent<HTMLElement>) => {
    if (!onLoadMore || isLogLoading || !hasMoreCommits) {
      return;
    }

    if (lastLoadMoreLengthRef.current === entries.length) {
      return;
    }

    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll <= 32) {
      lastLoadMoreLengthRef.current = entries.length;
      onLoadMore();
    }
  }, [entries.length, hasMoreCommits, isLogLoading, onLoadMore]);

  if (!log) {
    return null;
  }

  const hasDivider =
    branchDivider !== null &&
    branchDivider.insertBeforeIndex > 0 &&
    branchDivider.insertBeforeIndex < entries.length;
  const hasDividerBelowLoaded = branchDivider !== null && branchDivider.insertBeforeIndex === entries.length;
  const hasSplitHistory = hasDivider || hasDividerBelowLoaded;

  const topEntries = hasDivider
    ? entries.slice(0, branchDivider.insertBeforeIndex)
    : hasDividerBelowLoaded
      ? entries
      : [];
  const bottomEntries = hasDivider ? entries.slice(branchDivider.insertBeforeIndex) : [];

  const dividerIcon = branchDivider?.direction === 'down'
    ? <RiArrowDownSLine className="size-3.5" />
    : <RiArrowUpLine className="size-3.5" />;

  const renderCommitList = (entries: GitLogEntry[]) => (
    <ul>
      {entries.map((entry) => (
        <HistoryCommitRow
          key={entry.hash}
          entry={entry}
          isExpanded={expandedCommitHashes.has(entry.hash)}
          onToggle={() => onToggleCommit(entry.hash)}
          files={commitFilesMap.get(entry.hash) ?? []}
          isLoadingFiles={loadingCommitHashes.has(entry.hash)}
          onCopyHash={onCopyHash}
          currentBranch={currentBranch}
          trackingBranch={trackingBranch}
        />
      ))}
    </ul>
  );

  const content = (
    <ScrollableOverlay
      outerClassName={`min-h-0 ${contentMaxHeightClassName}`}
      className="h-full w-full"
      onScroll={handleHistoryScroll}
    >
      {entries.length === 0 ? (
        <div className="flex h-full items-center justify-center p-4">
          <p className="typography-ui-label text-muted-foreground">
            {t('gitView.history.noCommits')}
          </p>
        </div>
      ) : hasSplitHistory && branchDivider ? (
        <div className="flex flex-col gap-0">
          {topEntries.length > 0 ? renderCommitList(topEntries) : null}

          <div className="flex items-center gap-2 px-3 py-1.5" aria-hidden>
            <span className="h-px flex-1 bg-border/60" />
            <span className="inline-flex max-w-[80%] items-center gap-1 typography-micro text-muted-foreground">
              <span className="truncate" title={branchDivider.branchName}>{branchDivider.branchName}</span>
              {dividerIcon}
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>

          {bottomEntries.length > 0 ? renderCommitList(bottomEntries) : null}
        </div>
      ) : (
        renderCommitList(entries)
      )}
    </ScrollableOverlay>
  );

  if (!showHeader) {
    if (hasSplitHistory) {
      return <section className={cn('h-full min-h-0', className)}>{content}</section>;
    }
    return (
      <section className={cn('h-full min-h-0 rounded-xl border border-border/60 bg-background/70 overflow-hidden', className)}>
        {content}
      </section>
    );
  }

  return (
    <section className={cn('flex flex-col min-h-0', className)}>
      <header className="group/history-header flex h-7 items-center justify-between gap-2 px-0 py-0">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <RiArrowRightSLine className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="typography-ui-header font-semibold text-foreground truncate">
            {t('gitView.history.title')}
          </h3>
        </button>
        {isOpen ? (
          <div
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {toolbarSlot}
          </div>
        ) : null}
      </header>

      {isOpen ? content : null}
    </section>
  );
};
