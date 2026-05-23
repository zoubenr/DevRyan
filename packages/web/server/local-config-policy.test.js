import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('local config ignore policy', () => {
  it('keeps repo-local opencode.json out of git by default', () => {
    const gitignorePath = path.resolve(process.cwd(), '..', '..', '.gitignore');
    const entries = fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/);

    expect(entries).toContain('/opencode.json');
  });
});
