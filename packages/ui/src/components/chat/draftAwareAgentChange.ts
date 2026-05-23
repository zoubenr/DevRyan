import { useConfigStore } from '@/stores/useConfigStore';

export type DraftAwareAgentChangeContext = {
    currentSessionId: string | null;
    currentDraftId: string | null;
    newSessionDraftOpen: boolean;
};

export type DraftAwareAgentChangeActions = {
    setAgent: (agentName: string, options?: { preserveCurrentModel?: boolean }) => void;
    saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
    getDraftModelSelection: (draftId: string) => { providerId: string; modelId: string } | null;
    saveDraftAgentSelection: (draftId: string, agentName: string) => void;
    saveDraftModelSelection: (draftId: string, providerId: string, modelId: string) => void;
    saveDraftAgentModelForSelection: (draftId: string, agentName: string, providerId: string, modelId: string) => void;
    saveDraftAgentModelVariantForSelection: (
        draftId: string,
        agentName: string,
        providerId: string,
        modelId: string,
        variant: string | undefined,
    ) => void;
    saveDraftSendConfig?: (
        draftId: string,
        sendConfig: {
            providerID?: string;
            modelID?: string;
            agent?: string;
            variant?: string;
        },
    ) => void;
};

export type DraftAwareModelChangeContext = DraftAwareAgentChangeContext & {
    currentAgentName?: string | null;
    variant?: string;
};

export type DraftAwareModelChangeActions = {
    setProviderModel: (providerId: string, modelId: string, variant?: string) => void;
    saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
    saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
    saveAgentModelVariantForSession: (
        sessionId: string,
        agentName: string,
        providerId: string,
        modelId: string,
        variant: string | undefined,
    ) => void;
    saveDraftModelSelection: (draftId: string, providerId: string, modelId: string) => void;
    saveDraftAgentModelForSelection: (draftId: string, agentName: string, providerId: string, modelId: string) => void;
    saveDraftAgentModelVariantForSelection: (
        draftId: string,
        agentName: string,
        providerId: string,
        modelId: string,
        variant: string | undefined,
    ) => void;
    saveDraftSendConfig?: (
        draftId: string,
        sendConfig: {
            providerID?: string;
            modelID?: string;
            agent?: string;
            variant?: string;
        },
    ) => void;
};

const normalizeAgentName = (agentName: string | null | undefined): string | undefined => {
    const trimmed = typeof agentName === 'string' ? agentName.trim() : '';
    return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Switch the active primary agent while preserving draft model selections when the user
 * has already chosen a provider/model for a new-session draft.
 */
export function applyDraftAwareAgentChange(
    agentName: string,
    context: DraftAwareAgentChangeContext,
    actions: DraftAwareAgentChangeActions,
): void {
    if (context.currentSessionId) {
        actions.setAgent(agentName);
        actions.saveSessionAgentSelection(context.currentSessionId, agentName);
        return;
    }

    if (context.currentDraftId && context.newSessionDraftOpen) {
        const savedDraftModel = actions.getDraftModelSelection(context.currentDraftId);
        const preservedDraftVariant = savedDraftModel
            ? useConfigStore.getState().currentVariant
            : undefined;

        actions.setAgent(agentName, savedDraftModel ? { preserveCurrentModel: true } : undefined);
        actions.saveDraftAgentSelection(context.currentDraftId, agentName);

        let draftModel: { providerId: string; modelId: string; variant?: string } | null = null;
        if (savedDraftModel) {
            draftModel = { ...savedDraftModel, variant: preservedDraftVariant };
        } else {
            const liveConfig = useConfigStore.getState();
            if (liveConfig.currentProviderId && liveConfig.currentModelId) {
                draftModel = {
                    providerId: liveConfig.currentProviderId,
                    modelId: liveConfig.currentModelId,
                    variant: liveConfig.currentVariant,
                };
            }
        }

        if (draftModel) {
            actions.saveDraftModelSelection(
                context.currentDraftId,
                draftModel.providerId,
                draftModel.modelId,
            );
            actions.saveDraftAgentModelForSelection(
                context.currentDraftId,
                agentName,
                draftModel.providerId,
                draftModel.modelId,
            );
            actions.saveDraftAgentModelVariantForSelection(
                context.currentDraftId,
                agentName,
                draftModel.providerId,
                draftModel.modelId,
                draftModel.variant,
            );
            actions.saveDraftSendConfig?.(context.currentDraftId, {
                providerID: draftModel.providerId,
                modelID: draftModel.modelId,
                agent: agentName,
                variant: draftModel.variant,
            });
        } else {
            actions.saveDraftSendConfig?.(context.currentDraftId, { agent: agentName });
        }
        return;
    }

    actions.setAgent(agentName);
}

/**
 * Switch the active provider/model while preserving the explicit choice on a
 * new-session draft so first send cannot fall back to settings defaults.
 */
export function applyDraftAwareModelChange(
    providerId: string,
    modelId: string,
    context: DraftAwareModelChangeContext,
    actions: DraftAwareModelChangeActions,
): void {
    actions.setProviderModel(providerId, modelId, context.variant);

    const agentName = normalizeAgentName(context.currentAgentName);

    if (context.currentSessionId) {
        actions.saveSessionModelSelection(context.currentSessionId, providerId, modelId);
        if (agentName) {
            actions.saveAgentModelForSession(context.currentSessionId, agentName, providerId, modelId);
            actions.saveAgentModelVariantForSession(
                context.currentSessionId,
                agentName,
                providerId,
                modelId,
                context.variant,
            );
        }
        return;
    }

    if (context.currentDraftId && context.newSessionDraftOpen) {
        actions.saveDraftModelSelection(context.currentDraftId, providerId, modelId);
        if (agentName) {
            actions.saveDraftAgentModelForSelection(context.currentDraftId, agentName, providerId, modelId);
            actions.saveDraftAgentModelVariantForSelection(
                context.currentDraftId,
                agentName,
                providerId,
                modelId,
                context.variant,
            );
        }
        actions.saveDraftSendConfig?.(context.currentDraftId, {
            providerID: providerId,
            modelID: modelId,
            agent: agentName,
            variant: context.variant,
        });
    }
}
