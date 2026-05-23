import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { isVSCodeRuntime } from '@/lib/desktop';

type ModelRef = { providerID: string; modelID: string };

const refsEqual = (a: ModelRef[], b: ModelRef[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.providerID !== b[i]?.providerID) return false;
    if (a[i]?.modelID !== b[i]?.modelID) return false;
  }
  return true;
};

export const startModelPrefsAutoSave = () => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  if (isVSCodeRuntime()) {
    return () => {};
  }

  let timer: number | null = null;
  let lastSent: { favoriteModels: ModelRef[] } | null = null;
  let didSkipInitial = false;

  const flush = () => {
    timer = null;
    const state = useUIStore.getState();
    const payload = { favoriteModels: state.favoriteModels };

    if (
      lastSent &&
      refsEqual(lastSent.favoriteModels, payload.favoriteModels)
    ) {
      return;
    }

    lastSent = {
      favoriteModels: payload.favoriteModels.slice(),
    };

    void updateDesktopSettings(payload).catch(() => {});
  };

  const schedule = () => {
    if (!didSkipInitial) {
      didSkipInitial = true;
      return;
    }
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(flush, 1200);
  };

  const unsubscribe = useUIStore.subscribe((state, prevState) => {
    const next = { favoriteModels: state.favoriteModels };
    const prev = { favoriteModels: prevState.favoriteModels };
    if (refsEqual(next.favoriteModels, prev.favoriteModels)) {
      return;
    }
    schedule();
  });

  return () => {
    unsubscribe();
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  };
};
