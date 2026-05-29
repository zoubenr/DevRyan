import React from 'react';

interface UseStreamingTextThrottleInput {
    text: string;
    isStreaming: boolean;
    throttleMs?: number;
    identityKey?: string;
}

export const DEFAULT_STREAMING_TEXT_THROTTLE_MS = 16;

export const computeStreamingThrottleDelay = (lastEmitAt: number, now: number, throttleMs: number): number => {
    const elapsed = now - lastEmitAt;
    return Math.max(0, throttleMs - elapsed);
};

interface StreamingThrottleState {
    timer: ReturnType<typeof setTimeout> | null;
    rafId: number | null;
    pendingText: string;
    lastEmitAt: number;
}

const clearTimer = (state: StreamingThrottleState): void => {
    if (!state.timer) {
        return;
    }
    clearTimeout(state.timer);
    state.timer = null;
};

const clearRaf = (state: StreamingThrottleState): void => {
    if (state.rafId === null) {
        return;
    }
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
};

export const useStreamingTextThrottle = ({
    text,
    isStreaming,
    throttleMs = DEFAULT_STREAMING_TEXT_THROTTLE_MS,
    identityKey,
}: UseStreamingTextThrottleInput): string => {
    const [throttledText, setThrottledText] = React.useState(text);
    const latestTextRef = React.useRef(text);
    const throttledTextRef = React.useRef(throttledText);

    const stateRef = React.useRef<StreamingThrottleState>({
        timer: null,
        rafId: null,
        pendingText: text,
        lastEmitAt: 0,
    });

    React.useEffect(() => {
        latestTextRef.current = text;
    }, [text]);

    React.useEffect(() => {
        throttledTextRef.current = throttledText;
    }, [throttledText]);

    React.useEffect(() => {
        const state = stateRef.current;
        clearTimer(state);
        clearRaf(state);
        state.pendingText = latestTextRef.current;
        state.lastEmitAt = 0;
        setThrottledText(latestTextRef.current);
    }, [identityKey]);

    React.useEffect(() => {
        const state = stateRef.current;
        state.pendingText = text;
        const currentThrottled = throttledTextRef.current;
        const stableText = isStreaming && currentThrottled.length > text.length ? currentThrottled : text;

        const emitPendingText = () => {
            state.lastEmitAt = Date.now();
            setThrottledText((prev) => {
                if (isStreaming && prev.length > state.pendingText.length) {
                    return prev;
                }
                return state.pendingText;
            });
        };

        if (!isStreaming) {
            clearTimer(state);
            clearRaf(state);
            setThrottledText(stableText);
            return;
        }

        const useRaf = throttleMs <= DEFAULT_STREAMING_TEXT_THROTTLE_MS
            && typeof requestAnimationFrame === 'function';

        if (useRaf) {
            clearTimer(state);
            if (state.rafId !== null) {
                return () => {
                    clearRaf(state);
                };
            }
            state.rafId = requestAnimationFrame(() => {
                state.rafId = null;
                emitPendingText();
            });
            return () => {
                clearRaf(state);
            };
        }

        const now = Date.now();
        const remaining = computeStreamingThrottleDelay(state.lastEmitAt, now, throttleMs);

        if (remaining <= 0) {
            clearTimer(state);
            clearRaf(state);
            emitPendingText();
            return;
        }

        clearTimer(state);
        clearRaf(state);
        state.timer = setTimeout(() => {
            state.timer = null;
            emitPendingText();
        }, remaining);

        return () => {
            clearTimer(state);
        };
    }, [isStreaming, text, throttleMs]);

    React.useEffect(() => {
        const state = stateRef.current;
        return () => {
            clearTimer(state);
            clearRaf(state);
        };
    }, []);

    return throttledText;
};
