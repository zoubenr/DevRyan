import type { I18nKey } from "@/lib/i18n";
import type { DiscoveredSkill } from "@/stores/useSkillsStore";

export function getSkillRowBadgeKeys(skill: Pick<DiscoveredSkill, "source">): I18nKey[] {
  switch (skill.source) {
    case "claude":
      return ["settings.skills.sidebar.badge.claude"];
    case "agents":
      return ["settings.skills.sidebar.badge.agents"];
    case "opencode":
    default:
      return ["settings.skills.sidebar.badge.opencode"];
  }
}
