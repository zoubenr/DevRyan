import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string) => readFileSync(resolve(testDir, relativePath), 'utf8');

describe('chat selection copy sanitizer wiring', () => {
    const hookSource = read('./useChatSelectionCopySanitizer.ts');
    const messageBodySource = read('../message/MessageBody.tsx');
    const chatContainerSource = read('../ChatContainer.tsx');

    test('listens for copy on document in the capture phase', () => {
        // Chromium dispatches the copy event for a non-editable selection above the
        // React root container, so a synthetic onCopy on the message node never fires.
        // The listener must be on `document` (capture) to see it.
        expect(hookSource).toContain("document.addEventListener('copy', handleCopy, true)");
        expect(hookSource).toContain("document.removeEventListener('copy', handleCopy, true)");
    });

    test('only rewrites the clipboard for user chat message selections', () => {
        expect(hookSource).toContain("'[data-chat-user-message]'");
        expect(hookSource).toContain('sanitizeChatSelectionCopyText(selection.toString())');
        expect(hookSource).toContain("clipboardData.setData('text/plain', sanitized)");
        expect(hookSource).toContain('event.preventDefault()');
    });

    test('user message root is marked so the document listener can scope to it', () => {
        expect(messageBodySource).toContain('data-chat-user-message="true"');
        // The unreliable per-message synthetic handler must not be reintroduced.
        expect(messageBodySource).not.toContain('onCopyCapture');
    });

    test('ChatContainer mounts the sanitizer once', () => {
        expect(chatContainerSource).toContain('useChatSelectionCopySanitizer()');
    });
});
