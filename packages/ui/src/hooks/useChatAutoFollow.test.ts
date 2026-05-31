import { describe, expect, test } from 'bun:test';

import type { SessionMemoryState } from '@/sync/viewport-store';
import {
    CHAT_FORCE_SCROLL_BOTTOM_EVENT,
    getPinnedFollowWriteMode,
    getPinnedContentFollowAction,
    requestChatScrollToBottom,
    shouldRestoreSavedScrollPosition,
    shouldReleaseAutoFollowFromScroll,
    shouldSettlePinnedIdleContentChange,
    shouldSettlePinnedIdleTransition,
} from './useChatAutoFollow';

const snapshot = (
    scrollTop: number,
    scrollHeight = 2000,
    clientHeight = 500,
): NonNullable<SessionMemoryState['scrollPosition']> => ({
    scrollTop,
    scrollHeight,
    clientHeight,
});

describe('requestChatScrollToBottom', () => {
    test('dispatches a force-scroll event scoped to the session', () => {
        const originalWindow = globalThis.window;
        const target = new EventTarget();
        const events: CustomEvent<{ sessionId?: string }>[] = [];
        const listener = (event: Event) => {
            events.push(event as CustomEvent<{ sessionId?: string }>);
        };

        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                addEventListener: target.addEventListener.bind(target),
                removeEventListener: target.removeEventListener.bind(target),
                dispatchEvent: target.dispatchEvent.bind(target),
            },
        });

        globalThis.window.addEventListener(CHAT_FORCE_SCROLL_BOTTOM_EVENT, listener);
        try {
            requestChatScrollToBottom('session-a');
        } finally {
            globalThis.window.removeEventListener(CHAT_FORCE_SCROLL_BOTTOM_EVENT, listener);
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: originalWindow,
            });
        }

        expect(events).toHaveLength(1);
        expect(events[0]?.detail).toEqual({ sessionId: 'session-a' });
    });
});

describe('shouldRestoreSavedScrollPosition', () => {
    test('opens a chat at latest even when a saved non-bottom position exists', () => {
        expect(shouldRestoreSavedScrollPosition('latest', snapshot(100), false)).toBe(false);
    });

    test('opens a chat at latest when no saved position exists', () => {
        expect(shouldRestoreSavedScrollPosition('latest', undefined, false)).toBe(false);
    });

    test('does not restore saved bottom-ish positions', () => {
        expect(shouldRestoreSavedScrollPosition('saved-position', snapshot(1425), false)).toBe(false);
    });

    test('preserves explicit saved-position restoration for non-bottom snapshots', () => {
        expect(shouldRestoreSavedScrollPosition('saved-position', snapshot(100), false)).toBe(true);
    });
});

describe('shouldSettlePinnedIdleTransition', () => {
    test('settles to bottom when a pinned working session becomes idle', () => {
        expect(shouldSettlePinnedIdleTransition({
            state: 'following',
            previousSessionIsWorking: true,
            nextSessionIsWorking: false,
        })).toBe(true);
    });

    test('does not settle when a released working session becomes idle', () => {
        expect(shouldSettlePinnedIdleTransition({
            state: 'released',
            previousSessionIsWorking: true,
            nextSessionIsWorking: false,
        })).toBe(false);
    });
});

describe('shouldSettlePinnedIdleContentChange', () => {
    test('settles idle content changes while pinned', () => {
        expect(shouldSettlePinnedIdleContentChange({
            state: 'following',
            sessionIsWorking: false,
        })).toBe(true);
    });

    test('does not settle idle content changes while released', () => {
        expect(shouldSettlePinnedIdleContentChange({
            state: 'released',
            sessionIsWorking: false,
        })).toBe(false);
    });
});

describe('getPinnedContentFollowAction', () => {
    test('uses continuous follow while pinned and working', () => {
        expect(getPinnedContentFollowAction({
            state: 'following',
            sessionIsWorking: true,
        })).toBe('continuous-follow');
    });

    test('uses idle settle while pinned and idle', () => {
        expect(getPinnedContentFollowAction({
            state: 'following',
            sessionIsWorking: false,
        })).toBe('idle-settle');
    });

    test('does not auto-follow after user release', () => {
        expect(getPinnedContentFollowAction({
            state: 'released',
            sessionIsWorking: true,
        })).toBe('none');
        expect(getPinnedContentFollowAction({
            state: 'released',
            sessionIsWorking: false,
        })).toBe('none');
    });

    test('suppresses pinned follow during anchor preservation', () => {
        expect(getPinnedContentFollowAction({
            state: 'following',
            sessionIsWorking: true,
            anchorPreservationActive: true,
        })).toBe('none');
        expect(getPinnedContentFollowAction({
            state: 'following',
            sessionIsWorking: false,
            anchorPreservationActive: true,
        })).toBe('none');
    });
});

describe('getPinnedFollowWriteMode', () => {
    test('locks pinned working content to the bottom instantly', () => {
        expect(getPinnedFollowWriteMode({
            action: 'continuous-follow',
            explicitSmoothRequest: false,
        })).toBe('instant');
    });

    test('preserves explicit smooth follow requests', () => {
        expect(getPinnedFollowWriteMode({
            action: 'continuous-follow',
            explicitSmoothRequest: true,
        })).toBe('animated');
    });

    test('keeps idle settle as an instant bottom correction', () => {
        expect(getPinnedFollowWriteMode({
            action: 'idle-settle',
            explicitSmoothRequest: false,
        })).toBe('instant');
    });

    test('does not write scroll when pinned follow is suppressed', () => {
        expect(getPinnedFollowWriteMode({
            action: 'none',
            explicitSmoothRequest: false,
        })).toBe('none');
    });
});

describe('shouldReleaseAutoFollowFromScroll', () => {
    test('does not release for app-induced upward scroll movement', () => {
        expect(shouldReleaseAutoFollowFromScroll({
            state: 'following',
            previousScrollTop: 800,
            nextScrollTop: 520,
            isProgrammatic: false,
            hasExplicitUserIntent: false,
        })).toBe(false);
    });

    test('releases for explicit upward user scroll intent', () => {
        expect(shouldReleaseAutoFollowFromScroll({
            state: 'following',
            previousScrollTop: 800,
            nextScrollTop: 520,
            isProgrammatic: false,
            hasExplicitUserIntent: true,
        })).toBe(true);
    });

    test('does not release programmatic upward movement', () => {
        expect(shouldReleaseAutoFollowFromScroll({
            state: 'following',
            previousScrollTop: 800,
            nextScrollTop: 520,
            isProgrammatic: true,
            hasExplicitUserIntent: true,
        })).toBe(false);
    });

    test('does not release when already released', () => {
        expect(shouldReleaseAutoFollowFromScroll({
            state: 'released',
            previousScrollTop: 800,
            nextScrollTop: 520,
            isProgrammatic: false,
            hasExplicitUserIntent: true,
        })).toBe(false);
    });
});
