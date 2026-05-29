import { beforeEach, describe, expect, test } from "bun:test";
import { opencodeClient } from "@/lib/opencode/client";
import { usePluginsStore } from "./usePluginsStore";

const originalFetch = globalThis.fetch;

const pluginsResponse = () => Response.json({
  entries: [
    {
      id: "config-user-plugin-one",
      spec: "plugin-one@1.0.0",
      scope: "user",
      kind: "config",
      parsedKind: "npm",
      sourcePath: "/tmp/home/.config/opencode/opencode.json",
    },
  ],
  files: [
    {
      id: "file-project-local-js",
      fileName: "local.js",
      scope: "project",
      kind: "file",
      absolutePath: "/tmp/project/.opencode/plugins/local.js",
    },
  ],
  errors: [],
});

describe("usePluginsStore", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    opencodeClient.setDirectory(`/tmp/devryan-plugins-store-${Date.now()}-${Math.random()}`);
    usePluginsStore.setState({
      entries: [],
      files: [],
      errors: [],
      selectedId: null,
      isLoading: false,
      lastError: null,
    });
  });

  test("loadPlugins requests plugins for the current directory and preserves references when unchanged", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      return pluginsResponse();
    }) as typeof fetch;

    await usePluginsStore.getState().loadPlugins({ refresh: true });
    const firstEntries = usePluginsStore.getState().entries;
    const firstFiles = usePluginsStore.getState().files;

    await usePluginsStore.getState().loadPlugins({ refresh: true });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/api/config/plugins?");
    expect(decodeURIComponent(calls[0])).toContain("directory=/tmp/devryan-plugins-store-");
    expect(usePluginsStore.getState().entries).toBe(firstEntries);
    expect(usePluginsStore.getState().files).toBe(firstFiles);
  });

  test("store API is read-only aside from loading and selection", () => {
    const keys = Object.keys(usePluginsStore.getState()).sort();

    expect(keys).toEqual([
      "entries",
      "errors",
      "files",
      "getById",
      "isLoading",
      "lastError",
      "loadPlugins",
      "selectedId",
      "setSelected",
    ]);
  });
});
