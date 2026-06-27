import React from 'react';
import { RiCloseLine, RiSearchLine } from '@remixicon/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type SessionSearchDialogItem = {
  id: string;
  title: string;
  projectLabel: string | null;
  branchLabel: string | null;
  directory: string | null;
  projectId: string | null;
  searchText: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (value: string) => void;
  items: SessionSearchDialogItem[];
  recentItems: SessionSearchDialogItem[];
  currentSessionId: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (item: SessionSearchDialogItem) => void;
};

const MAX_VISIBLE_ITEMS = 50;

const normalizeQuery = (value: string): string => value.trim().toLowerCase();

export function SessionSearchDialog({
  open,
  onOpenChange,
  query,
  onQueryChange,
  items,
  recentItems,
  currentSessionId,
  inputRef,
  onSelect,
}: Props): React.ReactNode {
  const { t } = useI18n();
  const normalizedQuery = normalizeQuery(query);
  const hasQuery = normalizedQuery.length > 0;
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [inputRef, open]);

  React.useEffect(() => {
    if (open) {
      setActiveIndex(0);
    }
  }, [open, query]);

  const visibleItems = React.useMemo(() => {
    const source = hasQuery
      ? items.filter((item) => item.searchText.includes(normalizedQuery))
      : recentItems;
    return source.slice(0, MAX_VISIBLE_ITEMS);
  }, [hasQuery, items, normalizedQuery, recentItems]);

  React.useEffect(() => {
    if (activeIndex >= visibleItems.length) {
      setActiveIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [activeIndex, visibleItems.length]);

  const selectItem = React.useCallback((item: SessionSearchDialogItem) => {
    onSelect(item);
  }, [onSelect]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (visibleItems.length === 0 ? 0 : (prev + 1) % visibleItems.length));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (visibleItems.length === 0 ? 0 : (prev - 1 + visibleItems.length) % visibleItems.length));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const activeItem = visibleItems[activeIndex];
      if (activeItem) {
        selectItem(activeItem);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (query.length > 0) {
        onQueryChange('');
      } else {
        onOpenChange(false);
      }
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      const shortcutIndex = Number(event.key) - 1;
      const shortcutItem = visibleItems[shortcutIndex];
      if (shortcutItem) {
        event.preventDefault();
        selectItem(shortcutItem);
      }
    }
  }, [activeIndex, onOpenChange, onQueryChange, query.length, selectItem, visibleItems]);

  const resultCountLabel = visibleItems.length === 1
    ? t('sessions.sidebar.header.search.matchCountSingle', { count: visibleItems.length })
    : t('sessions.sidebar.header.search.matchCountPlural', { count: visibleItems.length });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(28rem,calc(100vh-4rem))] max-w-[32rem] items-stretch justify-start gap-0 overflow-hidden rounded-2xl border-border/80 bg-[var(--surface-elevated)] p-0 shadow-2xl ring-1 ring-border/50"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('sessions.sidebar.header.actions.searchSessions')}</DialogTitle>
          <DialogDescription>{t('sessions.sidebar.header.search.placeholder')}</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/70 bg-[var(--surface-subtle)]/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <RiSearchLine className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('sessions.sidebar.header.search.placeholder')}
              className="h-10 flex-1 border-0 bg-transparent px-0 typography-markdown text-foreground ring-0 placeholder:text-muted-foreground hover:bg-transparent focus:ring-0"
              aria-label={t('sessions.sidebar.header.actions.searchSessions')}
            />
            {query.length > 0 ? (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label={t('sessions.sidebar.header.search.clear')}
              >
                <RiCloseLine className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex items-center justify-between typography-micro text-muted-foreground">
            <span>{hasQuery ? resultCountLabel : t('sessions.sidebar.activity.recentTitle')}</span>
            <span>↑↓ Enter Esc</span>
          </div>
        </div>

        <ScrollableOverlay
          outerClassName="max-h-[22rem]"
          className="p-2"
          scrollbarClassName="overlay-scrollbar--flush overlay-scrollbar--dense overlay-scrollbar--zero"
          disableHorizontal
          preventOverscroll
        >
          {visibleItems.length > 0 ? (
            <div role="listbox" aria-label={t('sessions.sidebar.header.actions.searchSessions')} className="space-y-1">
              {visibleItems.map((item, index) => {
                const isActive = index === activeIndex;
                const isCurrent = item.id === currentSessionId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectItem(item)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                      isActive ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate typography-ui-label font-medium', isCurrent && 'text-primary')}>
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 typography-meta text-muted-foreground">
                        {item.projectLabel ? <span className="truncate">{item.projectLabel}</span> : null}
                        {item.branchLabel ? <span className="truncate">{item.branchLabel}</span> : null}
                      </span>
                    </span>
                    {isCurrent ? (
                      <span className="rounded-full border border-primary/30 px-2 py-0.5 typography-micro font-medium text-primary">
                        current
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-muted-foreground">
              <p className="typography-ui-label font-semibold text-foreground">{t('sessions.sidebar.empty.noMatches.title')}</p>
              <p className="typography-meta mt-1">{t('sessions.sidebar.empty.noMatches.description')}</p>
            </div>
          )}
        </ScrollableOverlay>
      </DialogContent>
    </Dialog>
  );
}
