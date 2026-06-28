import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';

import { applyRetryOverlay } from './applyRetryOverlay';
import type { ChatMessageEntry } from './types';

const message = (id: string, role: 'user' | 'assistant', error?: unknown): Message => ({
    id,
    sessionID: 'session-1',
    role,
    time: { created: 1000 },
    ...(error ? { error } : {}),
} as unknown as Message);

const entry = (id: string, role: 'user' | 'assistant', parts: Part[] = [], error?: unknown): ChatMessageEntry => ({
    info: message(id, role, error),
    parts,
});

const textPart = (text: string): Part => ({
    id: 'part-text',
    messageID: 'assistant-1',
    sessionID: 'session-1',
    type: 'text',
    text,
} as unknown as Part);

const reasoningPart = (text: string): Part => ({
    id: 'part-reasoning',
    messageID: 'assistant-1',
    sessionID: 'session-1',
    type: 'reasoning',
    text,
} as unknown as Part);

const toolPart = (): Part => ({
    id: 'part-tool',
    messageID: 'assistant-1',
    sessionID: 'session-1',
    type: 'tool',
    tool: 'read',
    state: { status: 'completed' },
} as unknown as Part);

const apply = (messages: ChatMessageEntry[]): ChatMessageEntry[] => applyRetryOverlay(messages, {
    sessionId: 'session-1',
    message: 'failed to connect, retry after 10000ms',
    fallbackTimestamp: 2000,
});

describe('applyRetryOverlay', () => {
    test('inserts a synthetic retry notice when no assistant response exists', () => {
        const messages = [entry('user-1', 'user')];
        const result = apply(messages);

        expect(result).toHaveLength(2);
        expect(result[1].info.id).toBe('synthetic_retry_notice_session-1');
        expect((result[1].info as { error?: { message?: string } }).error?.message).toBe('failed to connect, retry after 10000ms');
    });

    test('does not attach retry error to assistant text content', () => {
        const messages = [entry('user-1', 'user'), entry('assistant-1', 'assistant', [textPart('hello')])];

        expect(apply(messages)).toBe(messages);
    });

    test('does not attach retry error to assistant tool content', () => {
        const messages = [entry('user-1', 'user'), entry('assistant-1', 'assistant', [toolPart()])];

        expect(apply(messages)).toBe(messages);
    });

    test('does not attach retry error to assistant reasoning content', () => {
        const messages = [entry('user-1', 'user'), entry('assistant-1', 'assistant', [reasoningPart('thinking')])];

        expect(apply(messages)).toBe(messages);
    });

    test('preserves existing assistant errors', () => {
        const existingError = { name: 'ProviderError', message: 'real failure' };
        const messages = [entry('user-1', 'user'), entry('assistant-1', 'assistant', [], existingError)];

        expect(apply(messages)).toBe(messages);
        expect((messages[1].info as { error?: unknown }).error).toBe(existingError);
    });
});
