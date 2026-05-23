export const resolveMessageHeaderVariant = (
    recordedVariant: string | undefined,
    modelVariantOptions: string[],
): string | undefined => {
    if (modelVariantOptions.length === 0) {
        return undefined;
    }

    if (recordedVariant && modelVariantOptions.includes(recordedVariant)) {
        return recordedVariant;
    }

    return modelVariantOptions.find((variant) => variant.toLowerCase() === 'medium') ?? modelVariantOptions[0];
};
