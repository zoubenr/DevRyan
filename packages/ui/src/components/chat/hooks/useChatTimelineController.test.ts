import { describe, expect, test } from 'bun:test';

import { shouldCapturePrependScrollSnapshot } from './useChatTimelineController';

describe('shouldCapturePrependScrollSnapshot', () => {
    test('captures reader position when loading older history while released', () => {
        expect(shouldCapturePrependScrollSnapshot({
            preserveViewport: true,
            isPinned: false,
            hasContainer: true,
        })).toBe(true);
    });

    test('does not capture while pinned so auto-follow owns bottom restoration', () => {
        expect(shouldCapturePrependScrollSnapshot({
            preserveViewport: true,
            isPinned: true,
            hasContainer: true,
        })).toBe(false);
    });

    test('does not capture without an explicit preserve request', () => {
        expect(shouldCapturePrependScrollSnapshot({
            preserveViewport: false,
            isPinned: false,
            hasContainer: true,
        })).toBe(false);
    });
});
