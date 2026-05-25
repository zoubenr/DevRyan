import { describe, expect, test } from 'bun:test';

import { isToolHeaderInteractive } from './toolHeaderInteractions';

describe('tool header interactions', () => {
    test('keeps subagent task headers static', () => {
        expect(isToolHeaderInteractive('task')).toBe(false);
    });

    test('keeps non-task tool headers interactive', () => {
        expect(isToolHeaderInteractive('bash')).toBe(true);
        expect(isToolHeaderInteractive('edit')).toBe(true);
    });
});
