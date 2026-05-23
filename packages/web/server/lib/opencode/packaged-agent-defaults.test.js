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
});
