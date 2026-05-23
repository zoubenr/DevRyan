import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@opencode-ai/sdk/v2';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

function createMessageEntry({
    id,
    role,
    parentID,
    createdAt,
    finish,
    parts = [],
}: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    parentID?: string;
    createdAt: number;
    finish?: string;
    parts?: Part[];
}): ChatMessageEntry {
    return {
        info: {
            id,
            role,
            ...(parentID ? { parentID } : {}),
            ...(finish ? { finish } : {}),
            time: { created: createdAt },
        } as Message,
        parts,
    };
}

describe('projectTurnRecords', () => {
    test('groups assistant replies under their parent user turn', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', parentID: 'u1', createdAt: 2 });

        const projection = projectTurnRecords([user, assistant]);

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.ungroupedMessageIds.size).toBe(0);
    });

    test('keeps out-of-order assistant replies attached to their parent user turn', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', parentID: 'u1', createdAt: 2 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', parentID: 'u2', createdAt: 4 });
        const user2 = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });

        const projection = projectTurnRecords([user1, assistant1, assistant2, user2]);

        expect(projection.turns).toHaveLength(2);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.turns[1]?.turnId).toBe('u2');
        expect(projection.turns[1]?.assistantMessageIds).toEqual(['a2']);
        expect(projection.ungroupedMessageIds.size).toBe(0);
    });

    test('does not render assistant replies while their parent user turn is missing', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', parentID: 'u1', createdAt: 2 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', parentID: 'u2', createdAt: 4 });

        const projection = projectTurnRecords([user1, assistant1, assistant2]);

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.ungroupedMessageIds.has('a2')).toBe(false);
        expect(projection.indexes.messageToTurnId.has('a2')).toBe(false);
    });

    test('does not render orphan assistant messages as standalone ungrouped entries', () => {
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', parentID: 'missing-user', createdAt: 1 });

        const projection = projectTurnRecords([assistant]);

        expect(projection.turns).toHaveLength(0);
        expect(projection.ungroupedMessageIds.has('a1')).toBe(false);
        expect(projection.indexes.messageToTurnId.has('a1')).toBe(false);
    });

    test('keeps non-assistant orphan messages available as ungrouped entries', () => {
        const system = createMessageEntry({ id: 's1', role: 'system', createdAt: 1 });

        const projection = projectTurnRecords([system]);

        expect(projection.turns).toHaveLength(0);
        expect(projection.ungroupedMessageIds.has('s1')).toBe(true);
    });

    test('reuses unchanged turn records from the previous projection', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', parentID: 'u1', createdAt: 2 });
        const user2 = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', parentID: 'u2', createdAt: 4 });
        const previous = projectTurnRecords([user1, assistant1, user2, assistant2]);
        const assistant2WithNewParts: ChatMessageEntry = {
            info: assistant2.info,
            parts: [{ id: 'p1', messageID: 'a2', type: 'text', text: 'new text' } as Part],
        };

        const next = projectTurnRecords([user1, assistant1, user2, assistant2WithNewParts], {
            previousProjection: previous,
        });

        expect(next.turns[0]).toBe(previous.turns[0]);
        expect(next.turns[1]).not.toBe(previous.turns[1]);
    });

    test('projects final assistant summary source ids for turn-aware actions', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const progress = createMessageEntry({
            id: 'a1',
            role: 'assistant',
            parentID: 'u1',
            createdAt: 2,
            parts: [{ id: 'progress-text', messageID: 'a1', type: 'text', text: 'Checking files.' } as Part],
        });
        const final = createMessageEntry({
            id: 'a2',
            role: 'assistant',
            parentID: 'u1',
            createdAt: 3,
            finish: 'stop',
            parts: [{ id: 'final-text', messageID: 'a2', type: 'text', text: 'Done.' } as Part],
        });

        const projection = projectTurnRecords([user, progress, final]);

        expect(projection.turns[0]?.summary).toEqual({
            text: 'Done.',
            sourceMessageId: 'a2',
            sourcePartId: 'final-text',
        });
    });
});
