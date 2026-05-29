import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(__dirname, '../../default-config/agents');

const LOCAL_PATH_PATTERNS = [
  /(^|[\s"'`])\/Users\//,
  /(^|[\s"'`])\/home\//,
  /(^|[\s"'`])\/private\//,
  /(^|[\s"'`])\/var\/folders\//,
  /(^|[\s"'`])~\//,
  /(^|[\s"'`])[A-Za-z]:\\Users\\/,
];

function containsLocalMachinePath(value) {
  return LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

describe('packaged agent defaults', () => {
  it('detects common user-local path forms', () => {
    expect(containsLocalMachinePath('external_directory: /Users/dev/.codex/skills')).toBe(true);
    expect(containsLocalMachinePath('external_directory: /home/dev/.codex/skills')).toBe(true);
    expect(containsLocalMachinePath('external_directory: /private/var/folders/dev/skills')).toBe(true);
    expect(containsLocalMachinePath('external_directory: /var/folders/dev/skills')).toBe(true);
    expect(containsLocalMachinePath('external_directory: ~/.codex/skills')).toBe(true);
    expect(containsLocalMachinePath('external_directory: C:\\Users\\dev\\.codex\\skills')).toBe(true);
    expect(containsLocalMachinePath('external_directory: /opt/devryan/skills')).toBe(false);
  });

  it('do not ship user-specific absolute external-directory permissions', () => {
    const offenders = [];

    for (const entry of fs.readdirSync(AGENTS_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(AGENTS_DIR, entry.name);
      const content = fs.readFileSync(filePath, 'utf8');
      for (const [index, line] of content.split('\n').entries()) {
        if (containsLocalMachinePath(line)) {
          offenders.push(`${entry.name}:${index + 1}:${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('primary coding agents require a terminal work summary', () => {
    for (const agentName of ['builder', 'orchestrator']) {
      const content = fs.readFileSync(path.join(AGENTS_DIR, `${agentName}.md`), 'utf8');

      expect(content).toContain('<Completion Contract>');
      expect(content).toContain('finish every completed work turn');
      expect(content).toContain('<summary>');
      expect(content).toContain('<verification>');
    }
  });

  it('council reconciles plan-mode prompts with its required council report', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'council.md'), 'utf8');

    expect(content).toContain('Plan-mode council requests');
    expect(content).toContain('<!--plan-->');
    expect(content).toContain('Councillor Details');
    expect(content).toContain('Council Summary');
    expect(content).toContain('immediately before the final plan body');
  });

  it('orchestrator prompt stays condensed while preserving routing contracts', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'orchestrator.md'), 'utf8');
    const lineCount = content.trimEnd().split('\n').length;

    expect(lineCount).toBeLessThanOrEqual(260);
    expect(content).toContain('Simple requests: do the work yourself');
    expect(content).toContain('Design-quality UI work: route to `designer`');
    expect(content).toContain('Context:');
    expect(content).toContain('Starting points:');
    expect(content).toContain('Return:');
    expect(content).toContain('<status>complete</status>');
    expect(content).toContain('No-mutation plans must keep snapshots and logs outside the target workspace');
  });

  it('specialist prompts stay compact while preserving terminal-status guardrails', () => {
    for (const agentName of ['designer', 'explorer', 'fixer', 'librarian', 'oracle']) {
      const content = fs.readFileSync(path.join(AGENTS_DIR, `${agentName}.md`), 'utf8');
      const lineCount = content.trimEnd().split('\n').length;

      expect(lineCount, `${agentName}.md line count`).toBeLessThanOrEqual(95);
      expect(content).toContain('On unrecoverable provider/tool errors, return `<status>blocked</status>` with a concise reason.');
      expect(content).toContain('Avoid repeated progress-only messages such as "continuing" or "implementing" without a terminal status marker.');
      expect(content).toContain('Do not use `git status`, `git diff`, `git diff --stat`, or `git diff --check` to determine whether you made edits.');
    }
  });
});
