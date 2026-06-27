export type ModelSelectorModelRef = {
  providerID: string;
  modelID: string;
};

export const getSelectedModelIndex = (
  favoriteModels: ModelSelectorModelRef[],
  providerModels: ModelSelectorModelRef[],
  providerId: string,
  modelId: string,
): number => {
  if (!providerId || !modelId) {
    return 0;
  }

  const models = [...favoriteModels, ...providerModels];
  const selectedIndex = models.findIndex(
    (entry) => entry.providerID === providerId && entry.modelID === modelId,
  );

  return selectedIndex >= 0 ? selectedIndex : 0;
};

export const getModelSelectorDropdownClassName = (): string => (
  'w-[min(420px,var(--available-width),calc(100vw-2rem))] min-w-[min(var(--anchor-width),420px,var(--available-width))] p-0 flex flex-col overflow-hidden'
);
