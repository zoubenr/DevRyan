import { getDisplayProviderId, getModelDisplayName } from '@/lib/providers/antigravity';

interface MessageHeaderDisplayInput {
    providerID: string | null;
    modelID?: string | null;
    modelName?: string;
    baseModelName?: string;
}

export interface MessageHeaderDisplay {
    providerID: string | null;
    modelName: string | undefined;
}

export const getMessageHeaderDisplay = ({
    providerID,
    modelID,
    modelName,
    baseModelName,
}: MessageHeaderDisplayInput): MessageHeaderDisplay => {
    const modelDisplayInfo = {
        ...(modelID ? { id: modelID } : {}),
        ...(providerID ? { providerID } : {}),
        ...(modelName ? { name: baseModelName || modelName } : {}),
    };

    return {
        providerID: providerID ? getDisplayProviderId(providerID, modelDisplayInfo) : providerID,
        modelName: modelName ? getModelDisplayName(modelDisplayInfo) : undefined,
    };
};
