import { describe, expect, test } from "bun:test"
import type { Agent } from "@opencode-ai/sdk/v2"
import {
  findSelectableAgentByName,
  isSelectablePrimaryAgentOption,
  resolveDefaultAgentName,
  resolveSelectableAgentOptions,
} from "./agentSelection"

describe("agent selection policy", () => {
  test("excludes plan even when it is marked primary", () => {
    expect(isSelectablePrimaryAgentOption({ name: "plan", mode: "primary" } as Agent)).toBe(false)
  })

  test("excludes non-primary agents", () => {
    expect(isSelectablePrimaryAgentOption({ name: "researcher", mode: "subagent" } as Agent)).toBe(false)
  })

  test("prefers selectable config agents over fallback store agents", () => {
    const resolved = resolveSelectableAgentOptions(
      [{ name: "orchestrator", mode: "primary" }] as Agent[],
      [{ name: "builder", mode: "primary" }] as Agent[],
    )

    expect(resolved.map((agent) => agent.name)).toEqual(["orchestrator"])
  })

  test("falls back to store agents when config agents are empty or filtered out", () => {
    const resolved = resolveSelectableAgentOptions(
      [
        { name: "plan", mode: "primary" },
        { name: "helper", mode: "subagent" },
      ] as Agent[],
      [
        { name: "orchestrator", mode: "primary" },
        { name: "builder", mode: "primary" },
      ] as Agent[],
    )

    expect(resolved.map((agent) => agent.name)).toEqual(["builder", "orchestrator"])
  })

  test("sorts selectable primary agents alphabetically by display name", () => {
    const resolved = resolveSelectableAgentOptions(
      [
        { name: "orchestrator", mode: "primary" },
        { name: "builder", mode: "primary" },
        { name: "council", mode: "all" },
      ] as Agent[],
      [],
    )

    expect(resolved.map((agent) => agent.name)).toEqual(["builder", "council", "orchestrator"])
  })

  test("keeps a saved fallback-source default selected", () => {
    const selectableAgents = resolveSelectableAgentOptions(
      [] as Agent[],
      [{ name: "builder", mode: "primary" }] as Agent[],
    )

    expect(resolveDefaultAgentName("builder", selectableAgents)).toBe("builder")
  })

  test("matches saved default agents case-insensitively", () => {
    const selectableAgents = resolveSelectableAgentOptions(
      [
        { name: "orchestrator", mode: "primary" },
        { name: "builder", mode: "primary" },
      ] as Agent[],
      [],
    )

    expect(findSelectableAgentByName(selectableAgents, "Orchestrator")?.name).toBe("orchestrator")
    expect(resolveDefaultAgentName("Orchestrator", selectableAgents)).toBe("orchestrator")
  })

  test("replaces an invalid plan default with a selectable fallback", () => {
    const selectableAgents = resolveSelectableAgentOptions(
      [
        { name: "plan", mode: "primary" },
        { name: "builder", mode: "primary" },
      ] as Agent[],
      [] as Agent[],
    )

    expect(resolveDefaultAgentName("plan", selectableAgents)).toBe("builder")
  })
})
