import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import { useProjectsStore } from "@/stores/useProjectsStore";
import type { PluginConfigError, PluginEntry, PluginFile, PluginsListResponse } from "@/lib/api/types";

interface PluginsStore {
  entries: PluginEntry[];
  files: PluginFile[];
  errors: PluginConfigError[];
  selectedId: string | null;
  isLoading: boolean;
  lastError: string | null;

  setSelected: (id: string | null) => void;
  loadPlugins: (options?: { refresh?: boolean }) => Promise<boolean>;
  getById: (id: string) => PluginEntry | PluginFile | undefined;
}

const PLUGINS_LOAD_CACHE_TTL_MS = 5000;
const DEFAULT_PLUGINS_CACHE_KEY = "__default__";
const pluginsLastLoadedAt = new Map<string, number>();
const pluginsLoadInFlight = new Map<string, Promise<boolean>>();

const getPluginsCacheKey = (directory: string | null): string => directory?.trim() || DEFAULT_PLUGINS_CACHE_KEY;

const getRequestDirectory = (): string | null => {
  try {
    const projectsStore = useProjectsStore.getState();
    const activeProject = projectsStore.getActiveProject?.();
    if (activeProject?.path?.trim()) {
      return activeProject.path.trim();
    }

    const clientDir = opencodeClient.getDirectory();
    if (clientDir?.trim()) {
      return clientDir.trim();
    }
  } catch (err) {
    console.warn("[PluginsStore] Error resolving config directory:", err);
  }

  return null;
};

const buildPluginsQueryString = (directory: string | null): string => {
  const params = new URLSearchParams();
  if (directory) {
    params.set("directory", directory);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
};

const normalizePluginEntry = (value: unknown): PluginEntry | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id : "";
  const spec = typeof candidate.spec === "string" ? candidate.spec : "";
  const scope = candidate.scope === "project" ? "project" : candidate.scope === "user" ? "user" : null;
  const parsedKind = candidate.parsedKind === "path" ? "path" : candidate.parsedKind === "npm" ? "npm" : null;
  const sourcePath = typeof candidate.sourcePath === "string" ? candidate.sourcePath : "";
  const options = candidate.options && typeof candidate.options === "object" && !Array.isArray(candidate.options)
    ? candidate.options as Record<string, unknown>
    : undefined;

  if (!id || !spec || !scope || !parsedKind || !sourcePath || candidate.kind !== "config") {
    return null;
  }

  return {
    id,
    spec,
    ...(options ? { options } : {}),
    scope,
    kind: "config",
    parsedKind,
    sourcePath,
  };
};

const normalizePluginFile = (value: unknown): PluginFile | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id : "";
  const fileName = typeof candidate.fileName === "string" ? candidate.fileName : "";
  const scope = candidate.scope === "project" ? "project" : candidate.scope === "user" ? "user" : null;
  const absolutePath = typeof candidate.absolutePath === "string" ? candidate.absolutePath : "";

  if (!id || !fileName || !scope || !absolutePath || candidate.kind !== "file") {
    return null;
  }

  return {
    id,
    fileName,
    scope,
    kind: "file",
    absolutePath,
  };
};

const normalizePluginError = (value: unknown): PluginConfigError | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const scope = candidate.scope === "project" ? "project" : candidate.scope === "user" ? "user" : null;
  const sourcePath = typeof candidate.sourcePath === "string" ? candidate.sourcePath : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const index = typeof candidate.index === "number" && Number.isFinite(candidate.index)
    ? Math.round(candidate.index)
    : null;

  if (!scope || !sourcePath || !message) {
    return null;
  }

  return { scope, sourcePath, index, message };
};

const normalizePluginsResponse = (payload: unknown): PluginsListResponse => {
  const candidate = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    entries: Array.isArray(candidate.entries) ? candidate.entries.map(normalizePluginEntry).filter((entry): entry is PluginEntry => entry !== null) : [],
    files: Array.isArray(candidate.files) ? candidate.files.map(normalizePluginFile).filter((file): file is PluginFile => file !== null) : [],
    errors: Array.isArray(candidate.errors) ? candidate.errors.map(normalizePluginError).filter((error): error is PluginConfigError => error !== null) : [],
  };
};

const buildPluginsSignature = (data: PluginsListResponse): string => {
  return JSON.stringify({
    entries: data.entries.map((entry) => ({
      id: entry.id,
      spec: entry.spec,
      options: entry.options ?? null,
      scope: entry.scope,
      parsedKind: entry.parsedKind,
      sourcePath: entry.sourcePath,
    })),
    files: data.files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      scope: file.scope,
      absolutePath: file.absolutePath,
    })),
    errors: data.errors,
  });
};

export const usePluginsStore = create<PluginsStore>()(
  devtools(
    (set, get) => ({
      entries: [],
      files: [],
      errors: [],
      selectedId: null,
      isLoading: false,
      lastError: null,

      setSelected: (id) => set({ selectedId: id }),

      loadPlugins: async (options) => {
        const directory = getRequestDirectory();
        const cacheKey = getPluginsCacheKey(directory);
        const now = Date.now();
        const loadedAt = pluginsLastLoadedAt.get(cacheKey) ?? 0;
        const hasCachedPlugins = get().entries.length > 0 || get().files.length > 0 || get().errors.length > 0;

        if (!options?.refresh && hasCachedPlugins && now - loadedAt < PLUGINS_LOAD_CACHE_TTL_MS) {
          return true;
        }

        const inFlight = pluginsLoadInFlight.get(cacheKey);
        if (!options?.refresh && inFlight) {
          return inFlight;
        }

        const request = (async () => {
          set({ isLoading: true, lastError: null });
          try {
            const response = await fetch(`/api/config/plugins${buildPluginsQueryString(directory)}`, {
              headers: { Accept: "application/json" },
            });
            if (!response.ok) {
              throw new Error("Failed to load plugins");
            }
            const next = normalizePluginsResponse(await response.json().catch(() => ({})));
            const current = get();
            const currentSignature = buildPluginsSignature({
              entries: current.entries,
              files: current.files,
              errors: current.errors,
            });
            const nextSignature = buildPluginsSignature(next);

            if (currentSignature === nextSignature) {
              set({ isLoading: false, lastError: null });
            } else {
              const nextIds = new Set([...next.entries, ...next.files].map((item) => item.id));
              set({
                ...next,
                selectedId: current.selectedId && nextIds.has(current.selectedId) ? current.selectedId : null,
                isLoading: false,
                lastError: null,
              });
            }
            pluginsLastLoadedAt.set(cacheKey, Date.now());
            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[PluginsStore] Failed to load plugins:", error);
            set({ isLoading: false, lastError: message });
            return false;
          }
        })();

        pluginsLoadInFlight.set(cacheKey, request);
        try {
          return await request;
        } finally {
          pluginsLoadInFlight.delete(cacheKey);
        }
      },

      getById: (id) => {
        return get().entries.find((entry) => entry.id === id) || get().files.find((file) => file.id === id);
      },
    }),
    { name: "plugins-store" },
  ),
);
