export type HiddenModelRef = {
  providerID: string;
  modelID: string;
};

type ProviderModelLike = Record<string, unknown> & {
  id?: string;
};

type ProviderLike<TModel extends ProviderModelLike = ProviderModelLike> = Record<string, unknown> & {
  id?: string;
  models?: TModel[];
};

export const isHiddenModelRef = (
  hiddenModels: HiddenModelRef[],
  providerID: string | null | undefined,
  modelID: string | null | undefined,
): boolean => {
  const normalizedProviderID = typeof providerID === 'string' ? providerID.trim() : '';
  const normalizedModelID = typeof modelID === 'string' ? modelID.trim() : '';

  if (!normalizedProviderID || !normalizedModelID) {
    return false;
  }

  return hiddenModels.some(
    (hidden) => hidden.providerID === normalizedProviderID && hidden.modelID === normalizedModelID,
  );
};

export const filterHiddenProviderModels = <
  TModel extends ProviderModelLike,
  TProvider extends ProviderLike<TModel>,
>(
  providers: TProvider[],
  hiddenModels: HiddenModelRef[],
  shouldKeepModel?: (provider: TProvider, model: TModel, modelID: string) => boolean,
): TProvider[] => providers
  .map((provider) => {
    const providerID = typeof provider.id === 'string' ? provider.id : '';
    const providerModels = Array.isArray(provider.models) ? provider.models : [];
    const visibleModels = providerModels.filter((model) => {
      const modelID = typeof model?.id === 'string' ? model.id : '';
      return !isHiddenModelRef(hiddenModels, providerID, modelID)
        && (shouldKeepModel ? shouldKeepModel(provider, model, modelID) : true);
    });

    return { ...provider, models: visibleModels };
  })
  .filter((provider) => provider.models.length > 0);
