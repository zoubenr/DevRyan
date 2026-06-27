import { sortModelsByDisplayName } from '@/lib/providers/sorting';
import { shouldHidePairedFastModel } from '@/lib/providers/variantControls';

export { sortProvidersByDisplayName } from '@/lib/providers/sorting';

interface ProviderModelLike {
  id?: string;
  name?: string;
}

interface ProviderWithModels<M> {
  id?: string;
  models?: readonly M[];
}

interface ProviderModelsDisplayOptions {
  hidePairedFastModels?: boolean;
}

export const getProviderModelsForDisplay = <M extends ProviderModelLike>(
  provider: ProviderWithModels<M>,
  options: ProviderModelsDisplayOptions = {},
): M[] => {
  const models = Array.isArray(provider.models) ? provider.models : [];
  const visibleModels = options.hidePairedFastModels
    ? models.filter((model) => !shouldHidePairedFastModel(provider, model.id))
    : models;
  return sortModelsByDisplayName(visibleModels);
};
