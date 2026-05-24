import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, 'CommitSection.tsx'), 'utf8');

describe('CommitSection primary action', () => {
  test('keeps the primary button dedicated to plain commit', () => {
    const code = source();

    expect(code).not.toContain('showSyncAsPrimaryAction');
    expect(code).not.toContain('onSync(trackingRemote)');
    expect(code).not.toContain('onGenerateMessage();');
    expect(code).not.toContain('onStartCommitGenerationChat();\\n            onCommit();');
    expect(code).toContain('onCommit();');
  });

  test('renders commit generation as a separate trailing sparkle action', () => {
    const code = source();

    expect(code).toContain('RiSparklingLine');
    expect(code).toContain('trailingAction={');
    expect(code).toContain('onStartCommitGenerationChat');
    expect(code).toContain("aria-label={t('gitView.commit.generateChatAria')}");
  });

  test('commit controls stay clickable when changes exist without requiring a message', () => {
    const code = source();

    expect(code).toContain('const hasScopedChanges = selectedCount > 0;');
    expect(code).toContain('const canStartCommitAction = hasScopedChanges && commitAction === null;');
    expect(code).not.toContain('hasCommitMessage &&');
  });

  test('does not show a staged-changes hint above the commit input', () => {
    const code = source();

    expect(code).not.toContain('gitView.commit.selectFilesHint');
  });
});
