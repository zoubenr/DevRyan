import { describe, expect, test } from 'bun:test';
import { getAssistantMessageBottomPaddingClass, hasRenderableAssistantContent } from './chatMessageLayout';

describe('getAssistantMessageBottomPaddingClass', () => {
    test('removes bottom padding only for streaming assistant placeholders with a header and no content', () => {
        expect(getAssistantMessageBottomPaddingClass({
            isUser: false,
            isFollowedByAssistant: false,
            isPlaceholderOnlyStreaming: true,
        })).toBe('pb-0');

        expect(getAssistantMessageBottomPaddingClass({
            isUser: false,
            isFollowedByAssistant: false,
            isPlaceholderOnlyStreaming: false,
        })).toBe('pb-8');

        expect(getAssistantMessageBottomPaddingClass({
            isUser: true,
            isFollowedByAssistant: false,
            isPlaceholderOnlyStreaming: true,
        })).toBe('pb-0');
    });
});

describe('hasRenderableAssistantContent', () => {
    test('treats empty text and compaction parts as placeholder content', () => {
        expect(hasRenderableAssistantContent([
            { type: 'text', text: '   ' },
            { type: 'compaction' },
        ])).toBe(false);

        expect(hasRenderableAssistantContent([
            { type: 'text', text: 'Assistant output' },
        ])).toBe(true);

        expect(hasRenderableAssistantContent([
            { type: 'reasoning' },
        ])).toBe(true);
    });
});
