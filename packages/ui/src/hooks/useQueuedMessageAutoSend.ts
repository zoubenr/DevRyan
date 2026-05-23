import React from 'react';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { useMessageQueueStore, type QueuedMessage } from '@/stores/messageQueueStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { parseAgentMentions } from '@/lib/messages/agentMentions';
import { getSyncSessionStatusAnyDirectory, getSyncBlockingRequestCountAnyDirectory } from '@/sync/sync-refs';
import { useAllSessionStatuses } from '@/sync/sync-context';
import { resolveQueuedAutoSendStatusType, type SessionStatusType } from './queuedMessageAutoSendStatus';
import { resolveSessionSendConfig } from '@/sync/send-config';
import { getPdfAttachmentValidation } from '@/lib/attachments/attachmentCapabilities';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

const buildQueuedPayload = (queue: QueuedMessage[]) => {
  const agents = useConfigStore.getState().getVisibleAgents();
  let primaryText = '';
  let primaryAttachments: AttachedFile[] = [];
  let agentMentionName: string | undefined;
  const additionalParts: Array<{ text: string; attachments?: AttachedFile[] }> = [];

  for (let i = 0; i < queue.length; i += 1) {
    const queued = queue[i];
    const { sanitizedText, mention } = parseAgentMentions(queued.content, agents);

    if (!agentMentionName && mention?.name) {
      agentMentionName = mention.name;
    }

    if (i === 0) {
      primaryText = sanitizedText;
      primaryAttachments = queued.attachments ?? [];
    } else {
      additionalParts.push({
        text: sanitizedText,
        attachments: queued.attachments,
      });
    }
  }

  return {
    primaryText,
    primaryAttachments,
    agentMentionName,
    additionalParts: additionalParts.length > 0 ? additionalParts : undefined,
  };
};

export function useQueuedMessageAutoSend(enabledOrOptions?: boolean | { enabled?: boolean }) {
  const { t } = useI18n();
  const enabled = typeof enabledOrOptions === 'boolean' ? enabledOrOptions : (enabledOrOptions?.enabled ?? true);
  const queuedMessages = useMessageQueueStore((state) => state.queuedMessages);
  const sessionStatusRecord = useAllSessionStatuses(enabled);

  const inFlightSessionsRef = React.useRef<Set<string>>(new Set());
  const previousStatusRef = React.useRef<Map<string, SessionStatusType>>(new Map());

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const dispatchSessionQueue = async (sessionId: string, queueSnapshot: QueuedMessage[]) => {
      if (queueSnapshot.length === 0) {
        return;
      }
      if (inFlightSessionsRef.current.has(sessionId)) {
        return;
      }
      const currentStatus = resolveQueuedAutoSendStatusType(
        sessionId,
        sessionStatusRecord,
        getSyncSessionStatusAnyDirectory(sessionId),
        getSyncBlockingRequestCountAnyDirectory(sessionId),
      );
      if (currentStatus !== 'idle') {
        return;
      }

      const claimedQueue = useMessageQueueStore.getState().claimQueueForSession(sessionId);
      if (claimedQueue.length === 0) {
        return;
      }

      const payload = buildQueuedPayload(claimedQueue);
      if (!payload.primaryText && payload.primaryAttachments.length === 0 && !payload.additionalParts?.length) {
        useMessageQueueStore.getState().restoreClaimedQueue(sessionId, claimedQueue);
        return;
      }

      // Use send config captured at queue time; fall back to current config
      const captured = claimedQueue[0]?.sendConfig;
      const resolved = captured?.providerID && captured?.modelID
        ? { ...captured, planMode: captured.planMode === true }
        : resolveSessionSendConfig(sessionId);
      if (!resolved.providerID || !resolved.modelID) {
        useMessageQueueStore.getState().restoreClaimedQueue(sessionId, claimedQueue);
        return;
      }

      const validation = getPdfAttachmentValidation({
        providerID: resolved.providerID,
        modelID: resolved.modelID,
        files: [
          ...payload.primaryAttachments,
          ...(payload.additionalParts ?? []).flatMap((part) => part.attachments ?? []),
        ],
      });
      if (validation.hasPdf && validation.status === 'unsupported') {
        toast.error(t('chat.chatInput.toast.pdfUnsupported'));
        useMessageQueueStore.getState().restoreClaimedQueue(sessionId, claimedQueue);
        return;
      }
      if (validation.hasPdf && validation.status === 'unknown') {
        toast.warning(t('chat.chatInput.toast.pdfUnknownSupport'));
      }

      inFlightSessionsRef.current.add(sessionId);

      try {
        await useSessionUIStore.getState().sendMessageToSession(
          sessionId,
          payload.primaryText,
          resolved.providerID,
          resolved.modelID,
          resolved.agent,
          payload.primaryAttachments,
          payload.agentMentionName,
          payload.additionalParts,
          resolved.variant,
          'normal',
          resolved.planMode
        );
      } catch (error) {
        console.warn('[queue] queued auto-send failed:', error);
        useMessageQueueStore.getState().restoreClaimedQueue(sessionId, claimedQueue);
      } finally {
        inFlightSessionsRef.current.delete(sessionId);
      }
    };

    const statusRecord = sessionStatusRecord ?? {};
    const nextStatusMap = new Map(previousStatusRef.current);
    for (const [sessionId, status] of Object.entries(statusRecord)) {
      if (status) {
        nextStatusMap.set(sessionId, status.type as SessionStatusType);
      }
    }

    const queueEntries = Object.entries(queuedMessages);
    queueEntries.forEach(([sessionId, queue]) => {
      const currentStatusType = resolveQueuedAutoSendStatusType(
        sessionId,
        statusRecord,
        getSyncSessionStatusAnyDirectory(sessionId),
        // Queue ownership follows the OpenCode session id. During reconnects or
        // directory switches, the blocking request can live in another child store.
        getSyncBlockingRequestCountAnyDirectory(sessionId),
      );
      const previousStatusType = previousStatusRef.current.get(sessionId);
      const becameIdle =
        (previousStatusType === 'busy'
          || previousStatusType === 'retry'
          || previousStatusType === 'blocked'
          || previousStatusType === 'unknown')
        && currentStatusType === 'idle';
      const firstSeenIdle = previousStatusType === undefined && currentStatusType === 'idle';

      if (queue.length > 0 && (becameIdle || firstSeenIdle)) {
        void dispatchSessionQueue(sessionId, queue);
      }

      nextStatusMap.set(sessionId, currentStatusType);
    });

    previousStatusRef.current = nextStatusMap;
  }, [enabled, queuedMessages, sessionStatusRecord, t]);
}
