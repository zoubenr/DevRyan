import type { Part } from '@opencode-ai/sdk/v2';
import type { ChatMessageEntry } from './turns/types';
import { buildTaskInvocationKey, type TaskSessionAssignment } from './taskSessionLinking';

const resolveMessageRole = (message: ChatMessageEntry): string | null => {
    const info = message.info as unknown as { clientRole?: string | null | undefined; role?: string | null | undefined };
    return (typeof info.clientRole === 'string' ? info.clientRole : null)
        ?? (typeof info.role === 'string' ? info.role : null)
        ?? null;
};

const getMessageSessionId = (message: ChatMessageEntry | undefined): string | null => {
    if (!message) return null;
    const sessionID = (message.info as unknown as { sessionID?: unknown }).sessionID;
    return typeof sessionID === 'string' && sessionID.trim().length > 0 ? sessionID : null;
};

const isUserSubtaskMessage = (message: ChatMessageEntry | undefined): message is ChatMessageEntry => {
    if (!message) return false;
    if (resolveMessageRole(message) !== 'user') return false;
    return message.parts.some((part) => part?.type === 'subtask');
};

const readTaskSessionId = (toolPart: Part): string | null => {
    const partRecord = toolPart as unknown as {
        state?: {
            metadata?: {
                sessionId?: unknown;
                sessionID?: unknown;
            };
            output?: unknown;
        };
    };
    const metadata = partRecord.state?.metadata;
    const fromMetadata =
        (typeof metadata?.sessionID === 'string' && metadata.sessionID.trim().length > 0
            ? metadata.sessionID.trim()
            : null)
        ?? (typeof metadata?.sessionId === 'string' && metadata.sessionId.trim().length > 0
            ? metadata.sessionId.trim()
            : null);
    if (fromMetadata) return fromMetadata;

    const output = partRecord.state?.output;
    if (typeof output === 'string') {
        const match = output.match(/task_id\s*:\s*([^\s<"']+)/i);
        if (match?.[1]) {
            return match[1];
        }
    }

    return null;
};

const getSubtaskBridge = (message: ChatMessageEntry): { isBridge: boolean; taskSessionId: string | null; taskKey?: string } => {
    if (resolveMessageRole(message) !== 'assistant' || message.parts.length !== 1) {
        return { isBridge: false, taskSessionId: null };
    }

    const onlyPart = message.parts[0] as unknown as {
        type?: unknown;
        tool?: unknown;
        id?: unknown;
        sessionID?: unknown;
        messageID?: unknown;
        callID?: unknown;
    } | null | undefined;

    if (onlyPart?.type !== 'tool') {
        return { isBridge: false, taskSessionId: null };
    }

    const toolName = typeof onlyPart.tool === 'string' ? onlyPart.tool.toLowerCase() : '';
    if (toolName !== 'task') {
        return { isBridge: false, taskSessionId: null };
    }

    return {
        isBridge: true,
        taskSessionId: readTaskSessionId(message.parts[0]),
        taskKey: buildTaskInvocationKey({
            parentSessionId: typeof onlyPart.sessionID === 'string' ? onlyPart.sessionID : getMessageSessionId(message) ?? undefined,
            messageId: typeof onlyPart.messageID === 'string' ? onlyPart.messageID : message.info.id,
            partId: typeof onlyPart.id === 'string' ? onlyPart.id : undefined,
            callId: typeof onlyPart.callID === 'string' ? onlyPart.callID : undefined,
        }),
    };
};

const withSubtaskSessionId = (message: ChatMessageEntry, taskSessionId: string): ChatMessageEntry => {
    const nextParts = message.parts.map((part) => {
        if (part?.type !== 'subtask') return part;
        const existing = (part as unknown as { taskSessionID?: unknown }).taskSessionID;
        if (typeof existing === 'string' && existing.trim().length > 0) return part;
        return {
            ...part,
            taskSessionID: taskSessionId,
        } as Part;
    });

    return {
        ...message,
        parts: nextParts,
    };
};

export const projectSubtaskBridgeMessage = (
    previous: ChatMessageEntry | undefined,
    current: ChatMessageEntry,
    assignments: ReadonlyMap<string, TaskSessionAssignment>,
): { hide: boolean; previous: ChatMessageEntry | undefined } => {
    if (!isUserSubtaskMessage(previous)) {
        return { hide: false, previous };
    }
    const previousMessage = previous;

    const bridge = getSubtaskBridge(current);
    if (!bridge.isBridge) {
        return { hide: false, previous };
    }

    const taskSessionId = bridge.taskSessionId ?? (bridge.taskKey ? assignments.get(bridge.taskKey)?.sessionId : undefined);

    if (!taskSessionId) {
        return { hide: false, previous };
    }

    return {
        hide: true,
        previous: withSubtaskSessionId(previousMessage, taskSessionId),
    };
};
