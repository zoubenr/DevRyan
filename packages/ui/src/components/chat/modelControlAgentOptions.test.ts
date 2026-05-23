import { describe, expect, test } from "bun:test"
import type { Agent } from "@opencode-ai/sdk/v2"
import { isSelectablePrimaryAgentOption, resolveAgentDisplayNameCandidate, resolveSelectableAgentOptions } from "./modelControlAgentOptions"

describe("resolveSelectableAgentOptions", () => {
  test("falls back to agents store options when config agents have no selectable primary agents", () => {
    const configAgents = [
      { name: "researcher", mode: "subagent" },
      { name: "plan", mode: "primary" },
    ] as Agent[]
    const fallbackAgents = [
      { name: "orchestrator", mode: "primary" },
      { name: "builder", mode: "primary" },
      { name: "plan", mode: "primary" },
      { name: "hidden", mode: "primary", hidden: true },
    ] as Agent[]

    const resolved = resolveSelectableAgentOptions(configAgents, fallbackAgents)

    expect(resolved.map((agent) => agent.name)).toEqual(["builder", "orchestrator"])
  })

  test("prefers selectable config agents over fallback agents", () => {
    const configAgents = [
      { name: "orchestrator", mode: "primary" },
    ] as Agent[]
    const fallbackAgents = [
      { name: "builder", mode: "primary" },
    ] as Agent[]

    const resolved = resolveSelectableAgentOptions(configAgents, fallbackAgents)

    expect(resolved.map((agent) => agent.name)).toEqual(["orchestrator"])
  })

  test("treats plan as a hidden built-in primary agent option", () => {
    expect(isSelectablePrimaryAgentOption({ name: "plan", mode: "primary" } as Agent)).toBe(false)
    expect(isSelectablePrimaryAgentOption({ name: "builder", mode: "primary" } as Agent)).toBe(true)
    expect(isSelectablePrimaryAgentOption({ name: "researcher", mode: "subagent" } as Agent)).toBe(false)
  })

  test("uses the resolved default agent instead of the first sorted agent for empty draft display", () => {
    const selectableAgents = [
      { name: "builder", mode: "primary" },
      { name: "orchestrator", mode: "primary" },
    ] as Agent[]

    expect(resolveAgentDisplayNameCandidate(undefined, "orchestrator", selectableAgents)).toBe("orchestrator")
  })
})
