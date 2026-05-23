import { describe, expect, test } from 'bun:test';
import {
    buildTaskSessionMessagesSignature,
    buildTaskSummaryEntriesFromSession,
    formatTaskErrorText,
    normalizeTaskSummaryEntries,
    parseTaskMetadataBlock,
    readTaskSessionIdFromOutput,
    stripTaskMetadataFromOutput,
    type SessionMessageWithParts,
} from './taskToolUtils';

describe('task tool metadata helpers', () => {
    test('parses task metadata session id and summary entries', () => {
        const output = [
            'completed work',
            '<task_metadata>{"sessionId":"child-session","summary":[{"tool":"read","title":"src/app.ts","status":"completed"}]}</task_metadata>',
        ].join('\n');

        expect(readTaskSessionIdFromOutput(output)).toBe('child-session');
        expect(stripTaskMetadataFromOutput(output)).toBe('completed work');
        expect(parseTaskMetadataBlock(output).summaryEntries).toEqual([
            {
                id: undefined,
                tool: 'read',
                state: {
                    status: 'completed',
                    title: 'src/app.ts',
                    input: undefined,
                    metadata: undefined,
                    output: undefined,
                    error: undefined,
                },
            },
        ]);
    });

    test('falls back to legacy task id output', () => {
        expect(readTaskSessionIdFromOutput('task_id: child-legacy')).toBe('child-legacy');
        expect(readTaskSessionIdFromOutput('session id: child spaced')).toBe('child');
    });

    test('normalizes string and object summary entries', () => {
        expect(normalizeTaskSummaryEntries([
            'Plain summary',
            {
                id: 'tool-1',
                tool: 'bash',
                status: 'completed',
                input: { command: 'bun test' },
            },
        ])).toEqual([
            {
                tool: 'tool',
                state: { status: 'completed', title: 'Plain summary' },
            },
            {
                id: 'tool-1',
                tool: 'bash',
                state: {
                    status: 'completed',
                    title: undefined,
                    input: { command: 'bun test' },
                    metadata: undefined,
                    output: undefined,
                    error: undefined,
                },
            },
        ]);
    });

    test('builds final child activity from assistant tools only and excludes nested task/todo tools', () => {
        const messages = [
            {
                info: { role: 'user', id: 'user-1', time: { created: 1 } },
                parts: [{ type: 'tool', id: 'ignored-user-tool', tool: 'read' }],
            },
            {
                info: { role: 'assistant', id: 'assistant-1', time: { created: 2 } },
                parts: [
                    { type: 'tool', id: 'read-1', tool: 'read', state: { status: 'completed', input: { path: 'src/app.ts' } } },
                    { type: 'tool', id: 'task-1', tool: 'task', state: { status: 'completed' } },
                    { type: 'tool', id: 'todo-1', tool: 'todowrite', state: { status: 'completed' } },
                    { type: 'tool', id: 'bash-1', tool: 'bash', state: { status: 'completed', input: { command: 'bun test' } } },
                ],
            },
        ] as unknown as SessionMessageWithParts[];

        expect(buildTaskSummaryEntriesFromSession(messages).map((entry) => entry.tool)).toEqual(['read', 'bash']);
    });

    test('session message signature tracks tail changes', () => {
        const base = [{
            info: { role: 'assistant', id: 'assistant-1', time: { created: 2 } },
            parts: [{ type: 'text', id: 'text-1', text: 'hello' }],
        }] as unknown as SessionMessageWithParts[];
        const changed = [{
            info: { role: 'assistant', id: 'assistant-1', time: { created: 2 } },
            parts: [{ type: 'text', id: 'text-1', text: 'hello world' }],
        }] as unknown as SessionMessageWithParts[];

        expect(buildTaskSessionMessagesSignature(base)).not.toBe(buildTaskSessionMessagesSignature(changed));
    });

    test('formats denied task tool errors instead of treating them as unavailable activity', () => {
        expect(formatTaskErrorText('The user has specified a rule which prevents you from using this specific tool call.')).toBe(
            'Task could not start: The user has specified a rule which prevents you from using this specific tool call.'
        );
    });
});
