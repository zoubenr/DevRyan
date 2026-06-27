import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Session } from '@opencode-ai/sdk/v2';
import { hasTreeExpansionStateChange } from './sessionNodeMemo';
import type { SessionNode } from './types';

const session = (id: string): Session => ({
  id,
  title: id,
  time: { created: 1, updated: 1 },
} as Session);

const node = (id: string, children: SessionNode[] = []): SessionNode => ({
  session: session(id),
  children,
  worktree: null,
});

describe('hasTreeExpansionStateChange', () => {
  test('detects expansion changes for descendant session rows', () => {
    const tree = node('parent', [
      node('child', [
        node('grandchild'),
      ]),
    ]);

    expect(hasTreeExpansionStateChange(
      tree,
      tree,
      new Set(['parent']),
      new Set(['parent', 'child']),
    )).toBe(true);
  });
});

describe('SessionNodeItem row hover metadata', () => {
  test('does not render session activity metadata in a row hover tooltip', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SessionNodeItem.tsx'), 'utf8');

    expect(source).not.toContain('TooltipContent side="right" sideOffset={8} className="max-w-xs text-left"');
    expect(source).not.toContain('{sessionUpdatedLabel}</div>');
  });
});

describe('session sidebar quick hover actions', () => {
  test('exposes pin and unarchive hover action flags', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SessionNodeItem.tsx'), 'utf8');

    expect(source).toContain('showQuickPinAction');
    expect(source).toContain('showQuickUnarchiveAction');
  });

  test('renders pin before archive and uses restore icon for unarchive', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SessionNodeItem.tsx'), 'utf8');

    expect(source.indexOf('showQuickPinAction')).toBeLessThan(source.indexOf('showQuickArchiveAction'));
    expect(source).toContain('handleQuickPinClick');
    expect(source).toContain('handleQuickUnarchiveClick');
    expect(source).toContain('RiArrowGoBackLine');
  });
});

describe('session sidebar archive reflow animation wiring', () => {
  test('wraps session rows and mapped session lists with layout animation boundaries', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const itemSource = readFileSync(join(testDir, 'SessionNodeItem.tsx'), 'utf8');
    const groupSource = readFileSync(join(testDir, 'SessionGroupSection.tsx'), 'utf8');
    const folderSource = readFileSync(join(testDir, '..', 'SessionFolderItem.tsx'), 'utf8');

    expect(itemSource).toContain('SessionSidebarMotionRow');
    expect(groupSource).toContain('AnimatePresence initial={false}');
    expect(folderSource).toContain('AnimatePresence initial={false}');
  });

  test('collapses entering and exiting rows without scale animation', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(testDir, 'SessionSidebarMotionRow.tsx'), 'utf8');
    const itemSource = readFileSync(join(testDir, 'SessionNodeItem.tsx'), 'utf8');

    expect(source).toContain('layout="position"');
    expect(source).toContain('initial={{ height: 0, opacity: 0 }}');
    expect(source).toContain("animate={{ height: 'auto', opacity: 1 }}");
    expect(source).toContain('exit={{ height: 0, opacity: 0 }}');
    expect(source).toContain("overflow: 'hidden'");
    expect(itemSource).toContain('left-[-10px]');
    expect(source).toContain('SESSION_LEADING_INDICATOR_CLIP_GUTTER_PX');
    expect(source).toContain('marginLeft: -SESSION_LEADING_INDICATOR_CLIP_GUTTER_PX');
    expect(source).toContain('paddingLeft: SESSION_LEADING_INDICATOR_CLIP_GUTTER_PX');
    expect(source).not.toContain('scale');
  });
});
