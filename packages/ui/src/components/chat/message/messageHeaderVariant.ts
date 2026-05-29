import { resolveThinkingVariant } from '@/lib/providers/variantControls';

interface MessageHeaderVariantDisplayInput {
    recordedVariant: string | undefined;
    modelVariantOptions: string[];
    fastEnabled: boolean;
}

export interface MessageHeaderVariantDisplay {
    variant: string | undefined;
    fastEnabled: boolean;
}

const isFastOnlyVariant = (variant: string | undefined) => variant?.trim().toLowerCase() === 'fast';

export const resolveMessageHeaderVariant = (
    recordedVariant: string | undefined,
    modelVariantOptions: string[],
): string | undefined => {
    return resolveMessageHeaderVariantDisplay({
        recordedVariant,
        modelVariantOptions,
        fastEnabled: false,
    }).variant;
};

export const resolveMessageHeaderVariantDisplay = ({
    recordedVariant,
    modelVariantOptions,
    fastEnabled,
}: MessageHeaderVariantDisplayInput): MessageHeaderVariantDisplay => {
    return {
        variant: resolveThinkingVariant(
            isFastOnlyVariant(recordedVariant) ? undefined : recordedVariant,
            modelVariantOptions,
        ),
        fastEnabled,
    };
};
