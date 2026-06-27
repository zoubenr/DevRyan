export type ModelRef = { providerID: string; modelID: string };

export type ModelPrefsSnapshot = {
  favoriteModels: ModelRef[];
  hiddenModels: ModelRef[];
};

export type ModelPrefsKey = keyof ModelPrefsSnapshot;

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
  hiddenModels: cloneModelRefs(snapshot.hiddenModels),
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
  const changedKeys = new Set(getChangedModelPrefsKeys(baseline, current));
  return {
    favoriteModels: changedKeys.has('favoriteModels') ? current.favoriteModels : incoming.favoriteModels,
    hiddenModels: changedKeys.has('hiddenModels') ? current.hiddenModels : incoming.hiddenModels,
  };
};
