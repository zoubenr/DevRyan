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
