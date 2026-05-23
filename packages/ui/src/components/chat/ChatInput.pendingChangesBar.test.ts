import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const chatInputSource = readFileSync(
    fileURLToPath(new URL('./ChatInput.tsx', import.meta.url)),
    'utf8',
);

describe('ChatInput pending changes summary', () => {
    test('does not render the pending workspace changes bar above the composer', () => {
        expect(chatInputSource).not.toContain('PendingChangesBar');
    });
});
