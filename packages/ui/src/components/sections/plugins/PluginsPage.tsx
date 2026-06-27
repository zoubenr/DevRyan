import React from "react";
import { RiCodeBoxLine, RiFileTextLine, RiFolderLine } from "@remixicon/react";
import { SettingsPageLayout } from "@/components/sections/shared/SettingsPageLayout";
import { SettingsSection } from "@/components/sections/shared/SettingsSection";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePluginsStore } from "@/stores/usePluginsStore";
import type { PluginEntry, PluginFile } from "@/lib/api/types";

const formatOptions = (options: Record<string, unknown> | undefined): string => {
  if (!options || Object.keys(options).length === 0) {
    return "{}";
  }
  return JSON.stringify(options, null, 2);
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="grid gap-1 border-b border-border/70 py-3 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]">
    <div className="typography-meta text-muted-foreground">{label}</div>
    <div className={cn("typography-ui min-w-0 break-words text-foreground", mono && "font-mono typography-meta")}>{value}</div>
  </div>
);

const ScopeBadge: React.FC<{ scope: "user" | "project"; label: string }> = ({ scope, label }) => (
  <span
    className="typography-micro rounded-full border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-2 py-0.5 font-medium text-muted-foreground"
    data-scope={scope}
  >
    {label}
  </span>
);

const EntryDetails: React.FC<{ entry: PluginEntry }> = ({ entry }) => {
  const { t } = useI18n();
  const Icon = entry.parsedKind === "path" ? RiFolderLine : RiCodeBoxLine;

  return (
    <SettingsPageLayout>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="typography-ui-header truncate font-semibold text-foreground">{entry.spec}</h2>
            <ScopeBadge
              scope={entry.scope}
              label={entry.scope === "project" ? t("settings.plugins.scope.project") : t("settings.plugins.scope.user")}
            />
          </div>
          <p className="typography-meta text-muted-foreground">{t("settings.plugins.page.readOnly")}</p>
        </div>
      </div>

      <SettingsSection title={t("settings.plugins.page.section.config")}>
        <DetailRow label={t("settings.plugins.page.field.spec")} value={entry.spec} mono />
        <DetailRow
          label={t("settings.plugins.page.field.kind")}
          value={entry.parsedKind === "path" ? t("settings.plugins.sidebar.kind.path") : t("settings.plugins.sidebar.kind.npm")}
        />
        <DetailRow
          label={t("settings.plugins.page.field.scope")}
          value={entry.scope === "project" ? t("settings.plugins.scope.project") : t("settings.plugins.scope.user")}
        />
        <DetailRow label={t("settings.plugins.page.field.sourcePath")} value={entry.sourcePath} mono />
      </SettingsSection>

      <SettingsSection title={t("settings.plugins.page.section.options")}>
        <pre className="typography-meta max-h-[360px] overflow-auto rounded-md border border-border bg-[var(--surface-elevated)] p-3 font-mono text-foreground">
          {formatOptions(entry.options)}
        </pre>
      </SettingsSection>
    </SettingsPageLayout>
  );
};

const FileDetails: React.FC<{ file: PluginFile }> = ({ file }) => {
  const { t } = useI18n();

  return (
    <SettingsPageLayout>
      <div className="flex items-center gap-3">
        <RiFileTextLine className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="typography-ui-header truncate font-semibold text-foreground">{file.fileName}</h2>
            <ScopeBadge
              scope={file.scope}
              label={file.scope === "project" ? t("settings.plugins.scope.project") : t("settings.plugins.scope.user")}
            />
          </div>
          <p className="typography-meta text-muted-foreground">{t("settings.plugins.page.fileReadOnly")}</p>
        </div>
      </div>

      <SettingsSection title={t("settings.plugins.page.section.file")}>
        <DetailRow label={t("settings.plugins.page.field.fileName")} value={file.fileName} mono />
        <DetailRow
          label={t("settings.plugins.page.field.scope")}
          value={file.scope === "project" ? t("settings.plugins.scope.project") : t("settings.plugins.scope.user")}
        />
        <DetailRow label={t("settings.plugins.page.field.absolutePath")} value={file.absolutePath} mono />
      </SettingsSection>
    </SettingsPageLayout>
  );
};

export const PluginsPage: React.FC = () => {
  const { t } = useI18n();
  const selectedId = usePluginsStore((state) => state.selectedId);
  const getById = usePluginsStore((state) => state.getById);
  const selected = selectedId ? getById(selectedId) : undefined;

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm text-center text-muted-foreground">
          <RiCodeBoxLine className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">{t("settings.plugins.page.empty.select")}</p>
          <p className="typography-meta mt-1 opacity-75">{t("settings.plugins.page.empty.description")}</p>
        </div>
      </div>
    );
  }

  return selected.kind === "config"
    ? <EntryDetails entry={selected} />
    : <FileDetails file={selected} />;
};
