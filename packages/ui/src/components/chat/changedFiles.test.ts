import { describe, expect, test } from 'bun:test';
import type { ToolPart } from '@opencode-ai/sdk/v2';

import { extractChangedFiles } from './changedFiles';

const toolPart = (id: string, state: Record<string, unknown>, tool = 'apply_patch'): ToolPart => ({
  id,
  type: 'tool',
  tool,
  messageID: 'message-1',
  state,
} as ToolPart);

describe('extractChangedFiles', () => {
  test('merges repeated patch entries for the same file with cumulative stats and patch text', () => {
    const files = extractChangedFiles([
      toolPart('patch-1', {
        status: 'completed',
        metadata: {
          files: [{
            relativePath: './src/a.ts',
            additions: 2,
            deletions: 1,
            patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line',
          }],
        },
      }),
      toolPart('patch-2', {
        status: 'completed',
        metadata: {
          files: [{
            relativePath: 'src/a.ts',
            additions: 3,
            deletions: 0,
            patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -8 +8,2 @@\n-old2\n+new2\n+line2',
          }],
        },
      }),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/a.ts');
    expect(files[0]?.additions).toBe(5);
    expect(files[0]?.deletions).toBe(1);
    expect(files[0]?.patch).toContain('new');
    expect(files[0]?.patch).toContain('new2');
  });

  test('extracts Cursor writeToolCall changed files from target path aliases', () => {
    const files = extractChangedFiles([
      toolPart('write-1', {
        status: 'completed',
        input: {
          targetFile: 'src/cursor-write.ts',
          fileText: 'const value = 1\n',
        },
      }, 'writeToolCall'),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/cursor-write.ts');
    expect(files[0]?.tool).toBe('write');
  });

  test('extracts Cursor applyPatchToolCall changed files from patchText', () => {
    const files = extractChangedFiles([
      toolPart('patch-cursor', {
        status: 'completed',
        input: {
          patchText: '--- a/src/cursor.ts\n+++ b/src/cursor.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line',
        },
      }, 'applyPatchToolCall'),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/cursor.ts');
    expect(files[0]?.tool).toBe('apply_patch');
    expect(files[0]?.additions).toBe(2);
    expect(files[0]?.deletions).toBe(1);
  });

  test('extracts finalized Cursor patch aliases with non-completed final statuses', () => {
    const files = extractChangedFiles([
      toolPart('patch-done', {
        status: 'done',
        input: {
          patchText: '--- a/src/cursor-done.ts\n+++ b/src/cursor-done.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line',
        },
      }, 'patchToolCall'),
      toolPart('patch-complete', {
        status: 'complete',
        input: {
          patchText: '--- a/src/cursor-complete.ts\n+++ b/src/cursor-complete.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line',
        },
      }, 'filePatchToolCall'),
    ]);

    expect(files.map((file) => file.path)).toEqual(['src/cursor-done.ts', 'src/cursor-complete.ts']);
    expect(files.every((file) => file.tool === 'apply_patch')).toBe(true);
  });
});
