import React from 'react';

import { useAssistantStatus, type AssistantActivePartType } from '@/hooks/useAssistantStatus';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { StatusRow } from './StatusRow';

// Exported for focused regression tests; keep component exports unchanged otherwise.
// eslint-disable-next-line react-refresh/only-export-components
export const shouldRenderStatusRowAssistantStatus = (
    activePartType: AssistantActivePartType,
    isWorking: boolean,
): boolean => isWorking && activePartType !== 'reasoning';

/**
 * Status row wrapper.
 * Uses the dedicated assistant status hook so the row keeps accurate live activity
 * labels while still limiting subscriptions to the active assistant message.
 */
export const StatusRowContainer: React.FC = React.memo(() => {
    const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
    const abortRecord = useSessionUIStore(
        React.useCallback((state) => {
            if (!currentSessionId) {
                return null;
            }
            return state.sessionAbortFlags?.get(currentSessionId) ?? null;
        }, [currentSessionId]),
    );
    const { working } = useAssistantStatus();
    const currentAgentName = useConfigStore((state) => state.currentAgentName);

    const wasAborted = Boolean(abortRecord && !abortRecord.acknowledged);
    const showWorkingPlaceholder = shouldRenderStatusRowAssistantStatus(working.activePartType, working.isWorking);

    return (
        <StatusRow
            isWorking={showWorkingPlaceholder}
            statusText={showWorkingPlaceholder ? working.statusText : null}
            isGenericStatus={working.isGenericStatus}
            isWaitingForPermission={working.isWaitingForPermission}
            wasAborted={wasAborted || working.wasAborted}
            abortActive={wasAborted || working.abortActive}
            retryInfo={working.retryInfo}
            showAssistantStatus
            showTodos={false}
            agentName={currentAgentName}
        />
    );
});

StatusRowContainer.displayName = 'StatusRowContainer';
