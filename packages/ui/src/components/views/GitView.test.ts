import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, 'GitView.tsx'), 'utf8');

describe('GitView revert actions', () => {
  test('does not show a success toast after reverting a single file', () => {
    const code = source();

    expect(code).not.toContain("toast.success(t('gitView.toast.revertedFile'");
  });
});

describe('GitView staged changes workflow', () => {
  test('does not show a success toast after starting commit generation chat', () => {
    const code = source();

    expect(code).not.toContain("toast.success(t('gitView.toast.generateCommitChatStarted')");
  });

  test('renders staged changes above unstaged changes and derives staged-only commit scope first', () => {
    const code = source();

    expect(code).toContain('stagedEntries');
    expect(code).toContain('unstagedEntries');
    expect(code).toContain("title={t('gitView.changes.stagedTitle')}");
    expect(code).toContain("kind: 'staged'");
    expect(code).toContain('stagedOnly: true');
  });

  test('falls back to all changed files when nothing is staged', () => {
    const code = source();

    expect(code).toContain("kind: 'all'");
    expect(code).toContain('changeEntries.map((entry) => entry.path)');
    expect(code).toContain('stagedOnly: commitScope.stagedOnly');
  });

  test('validates commit messages before creating a commit', () => {
    const code = source();

    expect(code).toContain('const validation = validateCommitMessage(commitMessage);');
    expect(code).toContain('const message = validation.cleaned;');
    expect(code).toContain('if (!validation.valid) {');
    expect(code).toContain("toast.error(validation.errors.join(' • '));");
    expect(code).toContain('if (!message) {');
    expect(code).toContain("toast.error(t('gitView.toast.selectFileToCommit'));");
    expect(code).toContain('await git.createGitCommit(currentDirectory, message, {');
  });

  test('wires stage and unstage actions through the runtime git API', () => {
    const code = source();

    expect(code).toContain('handleStageFile');
    expect(code).toContain('handleUnstageFile');
    expect(code).toContain('git.stageGitFile');
    expect(code).toContain('git.unstageGitFile');
  });
});
