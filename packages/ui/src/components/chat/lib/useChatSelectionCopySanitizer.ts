import React from 'react';

import { sanitizeChatSelectionCopyText } from './selectionClipboard';

const resolveElement = (node: Node | null): HTMLElement | null => {
    if (!node) {
        return null;
    }
    return node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
};

/**
 * Strips the trailing block-serialization newlines that `selection.toString()`
 * appends when a chat message is copied via the native Cmd/Ctrl+C path.
 *
 * This must live on `document` rather than on the message node: Chromium
 * dispatches the `copy` event for a non-editable selection above the React root
 * container, so React's synthetic `onCopy`/`onCopyCapture` handlers on the
 * individual message elements never fire. A document-level capture listener is
 * the only place guaranteed to see the event. It is a no-op unless the
 * selection originates inside a user chat message, so other copies (code blocks,
 * inputs, the rest of the app) keep their native behavior.
 */
export const useChatSelectionCopySanitizer = (): void => {
    React.useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        const handleCopy = (event: ClipboardEvent) => {
            const clipboardData = event.clipboardData;
            if (!clipboardData || typeof window === 'undefined') {
                return;
            }

            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                return;
            }

            const range = selection.getRangeAt(0);
            const withinUserMessage = resolveElement(range.commonAncestorContainer)?.closest(
                '[data-chat-user-message]',
            );
            if (!withinUserMessage) {
                return;
            }

            const sanitized = sanitizeChatSelectionCopyText(selection.toString());
            if (!sanitized) {
                return;
            }

            event.preventDefault();
            clipboardData.setData('text/plain', sanitized);
        };

        document.addEventListener('copy', handleCopy, true);
        return () => {
            document.removeEventListener('copy', handleCopy, true);
        };
    }, []);
};
