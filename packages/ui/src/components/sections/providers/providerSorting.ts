import { sortModelsByDisplayName } from '@/lib/providers/sorting';
import { shouldHideCursorAcpFastModel } from '@/lib/providers/cursorAcp';

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
  hideCursorAcpFastDuplicates?: boolean;
}

export const getProviderModelsForDisplay = <M extends ProviderModelLike>(
  provider: ProviderWithModels<M>,
  options: ProviderModelsDisplayOptions = {},
): M[] => {
  const models = Array.isArray(provider.models) ? provider.models : [];
  const visibleModels = options.hideCursorAcpFastDuplicates
    ? models.filter((model) => !shouldHideCursorAcpFastModel(provider, model.id))
    : models;
  return sortModelsByDisplayName(visibleModels);
};
