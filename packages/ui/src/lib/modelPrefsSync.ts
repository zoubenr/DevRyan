export type ModelRef = { providerID: string; modelID: string };

export type ModelPrefsSnapshot = {
  favoriteModels: ModelRef[];
  favoriteModelsUpdatedAt: number;
  hiddenModels: ModelRef[];
  hiddenModelsUpdatedAt: number;
};

export type ModelPrefsKey = 'favoriteModels' | 'hiddenModels';

const cloneModelRefs = (refs: ModelRef[]): ModelRef[] => refs.map((ref) => ({
  providerID: ref.providerID,
  modelID: ref.modelID,
}));

export const modelRefsEqual = (a: ModelRef[], b: ModelRef[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.providerID !== b[i]?.providerID) return false;
    if (a[i]?.modelID !== b[i]?.modelID) return false;
  }
  return true;
};

export const createModelPrefsBaseline = (snapshot: ModelPrefsSnapshot): ModelPrefsSnapshot => ({
  favoriteModels: cloneModelRefs(snapshot.favoriteModels),
  favoriteModelsUpdatedAt: snapshot.favoriteModelsUpdatedAt,
  hiddenModels: cloneModelRefs(snapshot.hiddenModels),
  hiddenModelsUpdatedAt: snapshot.hiddenModelsUpdatedAt,
});

export const getChangedModelPrefsKeys = (
  baseline: ModelPrefsSnapshot,
  current: ModelPrefsSnapshot,
): ModelPrefsKey[] => {
  const changed: ModelPrefsKey[] = [];
  if (!modelRefsEqual(baseline.favoriteModels, current.favoriteModels)) {
    changed.push('favoriteModels');
  }
  if (!modelRefsEqual(baseline.hiddenModels, current.hiddenModels)) {
    changed.push('hiddenModels');
  }
  return changed;
};

export const modelPrefsEqual = (
  a: ModelPrefsSnapshot,
  b: ModelPrefsSnapshot,
): boolean => getChangedModelPrefsKeys(a, b).length === 0;

export const resolveModelPrefsFromSettingsSnapshot = ({
  baseline,
  current,
  incoming,
}: {
  baseline: ModelPrefsSnapshot;
  current: ModelPrefsSnapshot;
  incoming: ModelPrefsSnapshot;
}): ModelPrefsSnapshot => {
  const resolveList = (
    listKey: ModelPrefsKey,
    timestampKey: 'favoriteModelsUpdatedAt' | 'hiddenModelsUpdatedAt',
  ): Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey> => {
    if (!modelRefsEqual(baseline[listKey], current[listKey])) {
      return { [listKey]: current[listKey], [timestampKey]: current[timestampKey] } as Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey>;
    }

    const incomingTimestamp = incoming[timestampKey];
    const currentTimestamp = current[timestampKey];

    if (incomingTimestamp > currentTimestamp) {
      return { [listKey]: incoming[listKey], [timestampKey]: incomingTimestamp } as Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey>;
    }
    if (currentTimestamp > incomingTimestamp) {
      return { [listKey]: current[listKey], [timestampKey]: currentTimestamp } as Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey>;
    }
    if (incomingTimestamp === 0 && incoming[listKey].length === 0 && current[listKey].length > 0) {
      return { [listKey]: current[listKey], [timestampKey]: currentTimestamp } as Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey>;
    }
    if (
      incomingTimestamp === currentTimestamp
      && current[listKey].length > 0
      && !modelRefsEqual(incoming[listKey], current[listKey])
    ) {
      return { [listKey]: current[listKey], [timestampKey]: currentTimestamp } as Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey>;
    }

    return { [listKey]: incoming[listKey], [timestampKey]: incomingTimestamp } as Pick<ModelPrefsSnapshot, typeof listKey | typeof timestampKey>;
  };

  const favorite = resolveList('favoriteModels', 'favoriteModelsUpdatedAt');
  const hidden = resolveList('hiddenModels', 'hiddenModelsUpdatedAt');
  return {
    favoriteModels: favorite.favoriteModels,
    favoriteModelsUpdatedAt: favorite.favoriteModelsUpdatedAt,
    hiddenModels: hidden.hiddenModels,
    hiddenModelsUpdatedAt: hidden.hiddenModelsUpdatedAt,
  };
};
