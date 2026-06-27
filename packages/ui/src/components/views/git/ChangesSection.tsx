import React from 'react';
import {
  RiArchiveStackLine,
  RiArrowDownSLine,
  RiArrowGoBackLine,
  RiArrowRightSLine,
  RiFolder3Fill,
  RiFolderOpenFill,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import { ChangeRow } from './ChangeRow';
import type { GitStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';

interface ChangesSectionProps {
  title?: string;
  changedFilesAriaLabel?: string;
  changeEntries: GitStatus['files'];
  diffStats: Record<string, { insertions: number; deletions: number }> | undefined;
  revertingPaths: Set<string>;
  stagingPaths?: Set<string>;
  onRevertAll?: (paths: string[]) => Promise<void> | void;
  onViewDiff: (path: string) => void;
  onRevertFile: (path: string) => void;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  isRevertingAll?: boolean;
  maxListHeightClassName?: string;
  onVisiblePathsChange?: (paths: string[]) => void;
  onOpenStashes?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

type ChangesTreeDirectoryNode = {
  id: string;
  path: string;
  name: string;
  children: Map<string, ChangesTreeDirectoryNode>;
  directFiles: GitStatus['files'];
  files: GitStatus['files'];
};

type FlattenedTreeRow =
  | {
      key: string;
      kind: 'directory';
      depth: number;
      directory: ChangesTreeDirectoryNode;
    }
  | {
      key: string;
      kind: 'file';
      depth: number;
      file: GitStatus['files'][number];
    };

const TREE_INDENT_PX = 14;

const normalizePathForTree = (value: string): string => value.replace(/\\/g, '/').replace(/^\/+/, '').trim();

const createDirectoryNode = (path: string, name: string): ChangesTreeDirectoryNode => ({
  id: `dir:${path}`,
  path,
  name,
  children: new Map(),
  directFiles: [],
  files: [],
});

const buildChangesTree = (entries: GitStatus['files']): ChangesTreeDirectoryNode => {
  const root = createDirectoryNode('', '');

  for (const file of entries) {
    const normalized = normalizePathForTree(file.path);
    if (!normalized) {
      continue;
    }

    const segments = normalized.split('/').filter(Boolean);
    const directorySegments = segments.slice(0, -1);
    let current = root;
    current.files.push(file);

    if (directorySegments.length > 0) {
      let currentPath = '';
      for (const segment of directorySegments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const existing = current.children.get(segment);
        if (existing) {
          existing.files.push(file);
          current = existing;
          continue;
        }

        const created = createDirectoryNode(currentPath, segment);
        created.files.push(file);
        current.children.set(segment, created);
        current = created;
      }
    }

    current.directFiles.push(file);
  }

  return root;
};

const flattenChangesTree = (
  root: ChangesTreeDirectoryNode,
  expandedDirectories: Set<string>,
): FlattenedTreeRow[] => {
  const rows: FlattenedTreeRow[] = [];

  const walk = (node: ChangesTreeDirectoryNode, depth: number) => {
    const directories = Array.from(node.children.values()).sort((a, b) => a.path.localeCompare(b.path));
    for (const directory of directories) {
      rows.push({
        key: directory.id,
        kind: 'directory',
        depth,
        directory,
      });

      if (expandedDirectories.has(directory.path)) {
        walk(directory, depth + 1);
      }
    }

    const directFiles = [...node.directFiles].sort((a, b) => a.path.localeCompare(b.path));

    for (const file of directFiles) {
      rows.push({
        key: `file:${normalizePathForTree(file.path)}`,
        kind: 'file',
        depth,
        file,
      });
    }
  };

  walk(root, 0);
  return rows;
};

export const ChangesSection: React.FC<ChangesSectionProps> = ({
  title,
  changedFilesAriaLabel,
  changeEntries,
  diffStats,
  revertingPaths,
  stagingPaths = new Set(),
  onRevertAll,
  onViewDiff,
  onRevertFile,
  onStageFile,
  onUnstageFile,
  isRevertingAll = false,
  maxListHeightClassName,
  onVisiblePathsChange,
  onOpenStashes,
  isOpen: controlledIsOpen,
  onOpenChange,
  className,
}) => {
  const { t } = useI18n();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const gitChangesViewMode = useUIStore((state) => state.gitChangesViewMode);
  const isTreeView = gitChangesViewMode === 'tree';
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(true);
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
  const totalCount = changeEntries.length;
  const [confirmRevertAllOpen, setConfirmRevertAllOpen] = React.useState(false);
  const treeRoot = React.useMemo(() => buildChangesTree(changeEntries), [changeEntries]);
  const [expandedDirectories, setExpandedDirectories] = React.useState<Set<string>>(new Set());

  const topLevelDirectoryPaths = React.useMemo(
    () => Array.from(treeRoot.children.values()).map((directory) => directory.path),
    [treeRoot]
  );

  React.useEffect(() => {
    if (!isTreeView) {
      return;
    }

    setExpandedDirectories((previous) => {
      const next = new Set<string>();
      const validTopLevel = new Set(topLevelDirectoryPaths);

      previous.forEach((path) => {
        if (path.includes('/')) {
          next.add(path);
          return;
        }
        if (validTopLevel.has(path)) {
          next.add(path);
        }
      });

      topLevelDirectoryPaths.forEach((path) => next.add(path));
      return next;
    });
  }, [isTreeView, topLevelDirectoryPaths]);

  const treeRows = React.useMemo(() => flattenChangesTree(treeRoot, expandedDirectories), [expandedDirectories, treeRoot]);
  const rowItems = React.useMemo(() => (isTreeView ? treeRows : changeEntries), [changeEntries, isTreeView, treeRows]);
  const rowCount = rowItems.length;

  React.useEffect(() => {
    if (!onVisiblePathsChange) {
      return;
    }

    if (rowCount === 0) {
      onVisiblePathsChange([]);
      return;
    }

    const toVisiblePath = (item: GitStatus['files'][number] | FlattenedTreeRow): string | null => {
      if (!isTreeView) {
        return (item as GitStatus['files'][number]).path;
      }

      const treeItem = item as FlattenedTreeRow;
      return treeItem.kind === 'file' ? treeItem.file.path : null;
    };

    onVisiblePathsChange(
      rowItems
        .slice(0, Math.min(30, rowCount))
        .map((item) => (item ? toVisiblePath(item) : null))
        .filter((value): value is string => Boolean(value))
    );
  }, [isTreeView, onVisiblePathsChange, rowCount, rowItems]);

  const containerClassName = cn('flex flex-col flex-1 min-h-0', className);
  const headerClassName = 'group/changes-header flex h-7 items-center justify-between gap-2 px-0 py-0';
  const scrollOuterClassName = `flex-1 min-h-0 pr-0 ${maxListHeightClassName ?? ''}`.trim();
  const rowPaddingClassName = 'pl-0 pr-1';

  const toggleDirectoryExpanded = React.useCallback((path: string) => {
    setExpandedDirectories((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const renderRow = React.useCallback((item: GitStatus['files'][number] | FlattenedTreeRow) => {
    if (!isTreeView) {
      const file = item as GitStatus['files'][number];
      return (
        <ChangeRow
          file={file}
          stats={diffStats?.[file.path]}
          onViewDiff={() => onViewDiff(file.path)}
          onRevert={() => onRevertFile(file.path)}
          onStage={onStageFile ? () => onStageFile(file.path) : undefined}
          onUnstage={onUnstageFile ? () => onUnstageFile(file.path) : undefined}
          isReverting={revertingPaths.has(file.path) || isRevertingAll}
          isStaging={stagingPaths.has(file.path)}
          rowPaddingClassName={rowPaddingClassName}
        />
      );
    }

    const row = item as FlattenedTreeRow;

    if (row.kind === 'file') {
      const file = row.file;
      return (
        <ChangeRow
          file={file}
          stats={diffStats?.[file.path]}
          onViewDiff={() => onViewDiff(file.path)}
          onRevert={() => onRevertFile(file.path)}
          onStage={onStageFile ? () => onStageFile(file.path) : undefined}
          onUnstage={onUnstageFile ? () => onUnstageFile(file.path) : undefined}
          isReverting={revertingPaths.has(file.path) || isRevertingAll}
          isStaging={stagingPaths.has(file.path)}
          rowPaddingClassName={rowPaddingClassName}
          indentPx={row.depth * TREE_INDENT_PX}
        />
      );
    }

    const directory = row.directory;
    const isExpanded = expandedDirectories.has(directory.path);

    return (
      <div
        className={cn('group flex items-center gap-1.5 py-0.5 hover:bg-sidebar/40', rowPaddingClassName)}
        style={{ paddingLeft: `${row.depth * TREE_INDENT_PX}px` }}
      >
        <button
          type="button"
          onClick={() => toggleDirectoryExpanded(directory.path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={isExpanded
            ? t('gitView.changes.collapseDirectoryAria', { path: directory.path })
            : t('gitView.changes.expandDirectoryAria', { path: directory.path })}
        >
          {isExpanded ? (
            <RiFolderOpenFill className="h-4 w-4 flex-shrink-0 text-primary/60" />
          ) : (
            <RiFolder3Fill className="h-4 w-4 flex-shrink-0 text-primary/60" />
          )}
          <span className="min-w-0 flex-1 truncate typography-ui-label text-foreground" title={directory.path}>
            {directory.name}
          </span>
          <span className="ml-auto shrink-0 typography-micro text-muted-foreground">{directory.files.length}</span>
        </button>
      </div>
    );
  }, [
    diffStats,
    expandedDirectories,
    isRevertingAll,
    isTreeView,
    onRevertFile,
    onStageFile,
    onUnstageFile,
    onViewDiff,
    revertingPaths,
    rowPaddingClassName,
    stagingPaths,
    t,
    toggleDirectoryExpanded,
  ]);

  const handleConfirmRevertAll = React.useCallback(async () => {
    if (!onRevertAll || isRevertingAll || changeEntries.length === 0) {
      return;
    }

    await onRevertAll(changeEntries.map((entry) => entry.path));
    setConfirmRevertAllOpen(false);
  }, [changeEntries, isRevertingAll, onRevertAll]);

  return (
    <>
      <section className={containerClassName}>
        <header className={headerClassName}>
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
            <h3 className="typography-ui-header font-semibold text-foreground truncate">{title ?? t('gitView.changes.title')}</h3>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/changes-header:opacity-100 group-focus-within/changes-header:opacity-100">
              {onRevertAll && totalCount > 0 ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmRevertAllOpen(true)}
                  disabled={isRevertingAll}
                  className="h-6 w-6 px-0"
                  aria-label={t('gitView.changes.revertAll')}
                  title={t('gitView.changes.revertAll')}
                >
                  <RiArrowGoBackLine className="size-4" />
                </Button>
              ) : null}
              {onOpenStashes ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 w-6 px-0"
                  onClick={onOpenStashes}
                  aria-label={t('gitView.stashes.title')}
                  title={t('gitView.stashes.title')}
                >
                  <RiArchiveStackLine className="size-4" />
                </Button>
              ) : null}
            </div>
            {totalCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--surface-elevated)] px-1.5 typography-micro font-semibold text-muted-foreground">
                {totalCount}
              </span>
            ) : null}
          </div>
        </header>
        {isOpen ? <div className={cn('relative flex flex-col min-h-0 w-full overflow-hidden', scrollOuterClassName)}>
          <div
            ref={scrollRef}
            className="overlay-scrollbar-target overlay-scrollbar-container flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <div role="list" aria-label={changedFilesAriaLabel ?? t('gitView.changes.changedFilesAria')}>
              {rowItems.map((item) => (
                <div
                  key={isTreeView ? (item as FlattenedTreeRow).key : `file:${(item as GitStatus['files'][number]).path}`}
                >
                  {renderRow(item)}
                </div>
              ))}
            </div>
          </div>
          <OverlayScrollbar containerRef={scrollRef} disableHorizontal />
        </div> : null}
      </section>

      <Dialog open={confirmRevertAllOpen} onOpenChange={(open) => { if (!isRevertingAll) setConfirmRevertAllOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('gitView.changes.revertAllDialogTitle')}</DialogTitle>
            <DialogDescription>
              {totalCount === 1
                ? t('gitView.changes.revertAllDescriptionSingle', { count: totalCount })
                : t('gitView.changes.revertAllDescriptionPlural', { count: totalCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmRevertAllOpen(false)} disabled={isRevertingAll}>
              {t('gitView.common.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleConfirmRevertAll()} disabled={isRevertingAll}>
              {isRevertingAll ? t('gitView.changes.reverting') : t('gitView.changes.revertAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
