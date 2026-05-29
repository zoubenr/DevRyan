import type { PluginEntry, PluginFile } from "@/lib/api/types";

export type PluginSidebarItem = {
  id: string;
  label: string;
  metadata: string;
  scope: "user" | "project";
  kind: "config" | "file";
  parsedKind?: "npm" | "path";
};

export type PluginSidebarGroup = {
  key: "project-entries" | "project-files" | "user-entries" | "user-files";
  scope: "user" | "project";
  kind: "config" | "file";
  items: PluginSidebarItem[];
};

const sortByLabel = (a: PluginSidebarItem, b: PluginSidebarItem) => a.label.localeCompare(b.label);

const entryToItem = (entry: PluginEntry): PluginSidebarItem => ({
  id: entry.id,
  label: entry.spec,
  metadata: entry.parsedKind,
  scope: entry.scope,
  kind: "config",
  parsedKind: entry.parsedKind,
});

const fileToItem = (file: PluginFile): PluginSidebarItem => ({
  id: file.id,
  label: file.fileName,
  metadata: "file",
  scope: file.scope,
  kind: "file",
});

export function groupPluginsForSidebar(input: { entries: PluginEntry[]; files: PluginFile[] }): PluginSidebarGroup[] {
  const groups: PluginSidebarGroup[] = [
    {
      key: "project-entries",
      scope: "project",
      kind: "config",
      items: input.entries.filter((entry) => entry.scope === "project").map(entryToItem).sort(sortByLabel),
    },
    {
      key: "project-files",
      scope: "project",
      kind: "file",
      items: input.files.filter((file) => file.scope === "project").map(fileToItem).sort(sortByLabel),
    },
    {
      key: "user-entries",
      scope: "user",
      kind: "config",
      items: input.entries.filter((entry) => entry.scope === "user").map(entryToItem).sort(sortByLabel),
    },
    {
      key: "user-files",
      scope: "user",
      kind: "file",
      items: input.files.filter((file) => file.scope === "user").map(fileToItem).sort(sortByLabel),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}
