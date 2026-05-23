interface SessionLinkRecord {
    id: string;
    parentID?: string;
}

type BlockingRequestRecord<T extends { id: string }> = Record<string, T[] | undefined>;

type BlockingRequestStateLike<Permission extends { id: string }, Question extends { id: string }> = {
    session?: SessionLinkRecord[];
    permission?: BlockingRequestRecord<Permission>;
    question?: BlockingRequestRecord<Question>;
};

export type ScopedBlockingRequests<Permission extends { id: string }, Question extends { id: string }> = {
    permissions: Permission[];
    questions: Question[];
};

export const collectVisibleSessionIdsForBlockingRequests = (
    sessions: SessionLinkRecord[] | undefined,
    currentSessionId: string | null,
): string[] => {
    if (!currentSessionId) return [];
    if (!Array.isArray(sessions) || sessions.length === 0) return [currentSessionId];

    const current = sessions.find((session) => session.id === currentSessionId);
    if (!current) return [currentSessionId];

    const childrenByParent = new Map<string, string[]>();
    for (const session of sessions) {
        if (!session.parentID) {
            continue;
        }
        const existing = childrenByParent.get(session.parentID) ?? [];
        existing.push(session.id);
        childrenByParent.set(session.parentID, existing);
    }

    const scoped = [currentSessionId];
    const seen = new Set(scoped);
    for (const sessionId of scoped) {
        const children = childrenByParent.get(sessionId) ?? [];
        for (const childId of children) {
            if (seen.has(childId)) {
                continue;
            }
            seen.add(childId);
            scoped.push(childId);
        }
    }

    return scoped;
};

export const flattenBlockingRequests = <T extends { id: string }>(
    source: Map<string, T[]>,
    sessionIds: string[],
): T[] => {
    if (sessionIds.length === 0) return [];
    const seen = new Set<string>();
    const result: T[] = [];

    for (const sessionId of sessionIds) {
        const entries = source.get(sessionId);
        if (!entries || entries.length === 0) continue;
        for (const entry of entries) {
            if (seen.has(entry.id)) continue;
            seen.add(entry.id);
            result.push(entry);
        }
    }

    return result;
};

export const flattenBlockingRequestsFromRecord = <T extends { id: string }>(
    source: BlockingRequestRecord<T> | undefined,
    sessionIds: string[],
): T[] => {
    if (!source || sessionIds.length === 0) return [];
    const seen = new Set<string>();
    const result: T[] = [];

    for (const sessionId of sessionIds) {
        const entries = source[sessionId];
        if (!entries || entries.length === 0) continue;
        for (const entry of entries) {
            if (seen.has(entry.id)) continue;
            seen.add(entry.id);
            result.push(entry);
        }
    }

    return result;
};

const areArraysSame = <T>(left: T[], right: T[]): boolean => {
    if (left === right) return true;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
};

export function createScopedBlockingRequestsSelector<
    Permission extends { id: string },
    Question extends { id: string },
>(currentSessionId: string | null) {
    let previousSessionIds: string[] = [];
    let previousPermissions: Permission[] = [];
    let previousQuestions: Question[] = [];
    let previousResult: ScopedBlockingRequests<Permission, Question> = {
        permissions: [],
        questions: [],
    };

    return (
        state: BlockingRequestStateLike<Permission, Question>,
    ): ScopedBlockingRequests<Permission, Question> => {
        const sessionIds = collectVisibleSessionIdsForBlockingRequests(state.session, currentSessionId);
        const permissions = flattenBlockingRequestsFromRecord(state.permission, sessionIds);
        const questions = flattenBlockingRequestsFromRecord(state.question, sessionIds);

        if (
            areArraysSame(previousSessionIds, sessionIds)
            && areArraysSame(previousPermissions, permissions)
            && areArraysSame(previousQuestions, questions)
        ) {
            return previousResult;
        }

        previousSessionIds = sessionIds;
        previousPermissions = permissions;
        previousQuestions = questions;
        previousResult = { permissions, questions };
        return previousResult;
    };
}
