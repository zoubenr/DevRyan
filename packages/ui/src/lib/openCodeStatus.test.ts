import { describe, expect, test } from 'bun:test';
import { formatOpenCodeVersionPolicyLines } from './openCodeStatus';

describe('formatOpenCodeVersionPolicyLines', () => {
  test('formats target and detected OpenCode runtime versions', () => {
    expect(
      formatOpenCodeVersionPolicyLines({
        targetVersion: '1.15.7',
        detectedVersion: '1.15.7',
        installCommand: 'curl -fsSL https://opencode.ai/install | bash -s -- --version 1.15.7 --no-modify-path',
      })
    ).toEqual([
      '- target-version: 1.15.7',
      '- detected-version: 1.15.7',
      '- install-command: curl -fsSL https://opencode.ai/install | bash -s -- --version 1.15.7 --no-modify-path',
    ]);
  });
});
