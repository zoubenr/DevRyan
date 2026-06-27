import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { isVSCodeRuntime } from '@/lib/desktop';
import { createModelPrefsBaseline, modelPrefsEqual, type ModelPrefsSnapshot } from '@/lib/modelPrefsSync';

export const startModelPrefsAutoSave = () => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  if (isVSCodeRuntime()) {
    return () => {};
  }

  let timer: number | null = null;
  let lastSent: ModelPrefsSnapshot = createModelPrefsBaseline({
    favoriteModels: useUIStore.getState().favoriteModels,
    hiddenModels: useUIStore.getState().hiddenModels,
  });

  const flush = () => {
    timer = null;
    const state = useUIStore.getState();
    const payload = {
      favoriteModels: state.favoriteModels,
      hiddenModels: state.hiddenModels,
    };

    if (modelPrefsEqual(lastSent, payload)) {
      return;
    }

    lastSent = createModelPrefsBaseline(payload);

    void updateDesktopSettings(payload).catch(() => {});
  };

  const schedule = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(flush, 1200);
  };

  const unsubscribe = useUIStore.subscribe((state, prevState) => {
    const next = { favoriteModels: state.favoriteModels, hiddenModels: state.hiddenModels };
    const prev = { favoriteModels: prevState.favoriteModels, hiddenModels: prevState.hiddenModels };
    if (modelPrefsEqual(next, prev)) {
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
