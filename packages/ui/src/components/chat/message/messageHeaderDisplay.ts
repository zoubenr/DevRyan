import { getDisplayProviderId, getModelDisplayName } from '@/lib/providers/antigravity';

interface MessageHeaderDisplayInput {
    providerID: string | null;
    modelID?: string | null;
    modelName?: string;
}

export interface MessageHeaderDisplay {
    providerID: string | null;
    modelName: string | undefined;
}

export const getMessageHeaderDisplay = ({
    providerID,
    modelID,
    modelName,
}: MessageHeaderDisplayInput): MessageHeaderDisplay => {
    const modelDisplayInfo = {
        ...(modelID ? { id: modelID } : {}),
        ...(providerID ? { providerID } : {}),
        ...(modelName ? { name: modelName } : {}),
    };

    return {
        providerID: providerID ? getDisplayProviderId(providerID, modelDisplayInfo) : providerID,
        modelName: modelName ? getModelDisplayName(modelDisplayInfo) : undefined,
    };
};
