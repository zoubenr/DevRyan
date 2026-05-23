type ProviderModelLike = Record<string, unknown> & {
  id?: string;
  providerID?: string;
  providerId?: string;
  name?: string;
};

type ProviderLike<TModel extends ProviderModelLike = ProviderModelLike> = Record<string, unknown> & {
  id?: string;
  name?: string;
  models?: TModel[];
};

const ANTIGRAVITY_PROVIDER_ID = 'antigravity';
const GOOGLE_PROVIDER_ID = 'google';
const ANTIGRAVITY_SUFFIX = /\s+\(Antigravity\)$/i;

const getModelProviderId = (model: ProviderModelLike): string => (
  typeof model.providerID === 'string'
    ? model.providerID
    : (typeof model.providerId === 'string' ? model.providerId : '')
);

export const isGoogleAntigravityModel = (
  providerId: string | null | undefined,
  model: ProviderModelLike | null | undefined,
): boolean => {
  if (!model) {
    return false;
  }

  const executionProviderId = getModelProviderId(model) || providerId || '';
  if (executionProviderId !== GOOGLE_PROVIDER_ID) {
    return false;
  }

  const modelId = typeof model.id === 'string' ? model.id : '';
  const modelName = typeof model.name === 'string' ? model.name : '';

  return modelId.startsWith('antigravity-') || ANTIGRAVITY_SUFFIX.test(modelName);
};

export const getDisplayProviderId = (
  providerId: string,
  model: ProviderModelLike,
): string => (
  isGoogleAntigravityModel(providerId, model) ? ANTIGRAVITY_PROVIDER_ID : providerId
);

export const getModelDisplayName = (model: ProviderModelLike): string => {
  const name = typeof model.name === 'string' && model.name.length > 0
    ? model.name
    : (typeof model.id === 'string' ? model.id : '');
  return name.replace(ANTIGRAVITY_SUFFIX, '');
};

export const getExecutionProviderId = (
  displayProviderId: string,
  model: ProviderModelLike,
): string => (
  isGoogleAntigravityModel(displayProviderId, model)
    ? GOOGLE_PROVIDER_ID
    : (getModelProviderId(model) || displayProviderId)
);

export const splitAntigravityProviderForDisplay = <
  TModel extends ProviderModelLike,
  TProvider extends ProviderLike<TModel>,
>(providers: TProvider[]): TProvider[] => {
  const result: TProvider[] = [];

  for (const provider of providers) {
    const providerId = typeof provider.id === 'string' ? provider.id : '';
    const models = Array.isArray(provider.models) ? provider.models : [];

    if (providerId !== GOOGLE_PROVIDER_ID) {
      result.push(provider);
      continue;
    }

    const googleModels: TModel[] = [];
    const antigravityModels: TModel[] = [];

    for (const model of models) {
      if (isGoogleAntigravityModel(providerId, model)) {
        antigravityModels.push({
          ...model,
          providerID: GOOGLE_PROVIDER_ID,
          name: getModelDisplayName(model),
        });
      } else {
        googleModels.push(model);
      }
    }

    if (googleModels.length > 0) {
      result.push({ ...provider, models: googleModels });
    }

    if (antigravityModels.length > 0) {
      result.push({
        ...provider,
        id: ANTIGRAVITY_PROVIDER_ID,
        name: 'Antigravity',
        models: antigravityModels,
      });
    }
  }

  return result;
};
