import { describe, expect, test } from "bun:test";
import type { PluginEntry, PluginFile } from "@/lib/api/types";
import { groupPluginsForSidebar } from "./pluginSidebarGrouping";

const entry = (spec: string, scope: "user" | "project"): PluginEntry => ({
  id: `entry-${scope}-${spec}`,
  spec,
  scope,
  kind: "config",
  parsedKind: spec.startsWith(".") ? "path" : "npm",
  sourcePath: `/tmp/${scope}/opencode.json`,
});

const file = (fileName: string, scope: "user" | "project"): PluginFile => ({
  id: `file-${scope}-${fileName}`,
  fileName,
  scope,
  kind: "file",
  absolutePath: `/tmp/${scope}/plugins/${fileName}`,
});

describe("groupPluginsForSidebar", () => {
  test("groups entries and files by scope and type in deterministic order", () => {
    const grouped = groupPluginsForSidebar({
      entries: [
        entry("zeta-plugin", "user"),
        entry("@scope/alpha@1.0.0", "project"),
      ],
      files: [
        file("local.ts", "project"),
        file("global.js", "user"),
      ],
    });

    expect(grouped.map((group) => ({
      key: group.key,
      items: group.items.map((item) => item.label),
    }))).toEqual([
      {
        key: "project-entries",
        items: ["@scope/alpha@1.0.0"],
      },
      {
        key: "project-files",
        items: ["local.ts"],
      },
      {
        key: "user-entries",
        items: ["zeta-plugin"],
      },
      {
        key: "user-files",
        items: ["global.js"],
      },
    ]);
  });

  test("returns no groups for empty plugin data", () => {
    expect(groupPluginsForSidebar({ entries: [], files: [] })).toEqual([]);
  });
});
