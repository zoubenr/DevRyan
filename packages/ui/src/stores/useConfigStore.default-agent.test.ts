import { beforeEach, describe, expect, test } from "bun:test"
import type { Agent, Model, Provider } from "@opencode-ai/sdk/v2"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { mergeRuntimeAgentsWithConfigOverrides, useConfigStore } from "./useConfigStore"

type TestProvider = Omit<Provider, "models"> & { models: Model[] }

const createModel = (providerID: string, id: string, variants?: Model["variants"]): Model => ({
  id,
  providerID,
  api: { id: providerID, url: "https://example.test", npm: providerID },
  name: id,
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 1000, output: 1000 },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-01-01",
  variants,
})

const providers: TestProvider[] = [
  {
    id: "opencode",
    name: "OpenCode",
    source: "custom",
    options: {},
    env: [],
    models: [
      createModel("opencode", "small"),
      createModel("opencode", "builder-model", { high: {} }),
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    source: "custom",
    options: {},
    env: [],
    models: [createModel("anthropic", "claude")],
  },
]

const agents: Agent[] = [
  {
    name: "Orchestrator",
    mode: "primary",
    model: { providerID: "opencode", modelID: "small" },
    permission: [],
    options: {},
  },
  {
    name: "Builder",
    mode: "primary",
    model: { providerID: "opencode", modelID: "builder-model" },
    variant: "high",
    permission: [],
    options: {},
  },
]

describe("useConfigStore default agent selection", () => {
  beforeEach(() => {
    useSessionUIStore.setState({ currentSessionId: null })
    useConfigStore.setState({
      activeDirectoryKey: "__global__",
      providers,
      agents,
      settingsDefaultAgent: "Builder",
      currentAgentName: "Orchestrator",
      currentProviderId: "anthropic",
      currentModelId: "claude",
      currentVariant: undefined,
      selectedProviderId: "anthropic",
      directoryScoped: {},
    })
  })

  test("applies the configured default agent with its model and variant to the draft selection", () => {
    useConfigStore.getState().applyDefaultsToCurrent()

    expect(useConfigStore.getState().currentAgentName).toBe("Builder")
    expect(useConfigStore.getState().currentProviderId).toBe("opencode")
    expect(useConfigStore.getState().currentModelId).toBe("builder-model")
    expect(useConfigStore.getState().currentVariant).toBe("high")
  })

  test("updates an empty draft immediately when the configured default agent changes", () => {
    useConfigStore.getState().setSettingsDefaultAgent("Builder")

    expect(useConfigStore.getState().currentAgentName).toBe("Builder")
    expect(useConfigStore.getState().currentProviderId).toBe("opencode")
    expect(useConfigStore.getState().currentModelId).toBe("builder-model")
    expect(useConfigStore.getState().currentVariant).toBe("high")
  })

  test("applies an agent configured model when switching without preservation", () => {
    useConfigStore.getState().setAgent("Builder")

    expect(useConfigStore.getState().currentAgentName).toBe("Builder")
    expect(useConfigStore.getState().currentProviderId).toBe("opencode")
    expect(useConfigStore.getState().currentModelId).toBe("builder-model")
    expect(useConfigStore.getState().currentVariant).toBe("high")
  })

  test("can switch draft agents without replacing a manually selected model", () => {
    useConfigStore.getState().setAgent("Builder", { preserveCurrentModel: true })

    expect(useConfigStore.getState().currentAgentName).toBe("Builder")
    expect(useConfigStore.getState().currentProviderId).toBe("anthropic")
    expect(useConfigStore.getState().currentModelId).toBe("claude")
    expect(useConfigStore.getState().currentVariant).toBe(undefined)
  })

  test("updates provider, model, and variant atomically", () => {
    const observed: Array<{ providerId: string; modelId: string; variant?: string }> = []
    const unsubscribe = useConfigStore.subscribe((state) => {
      observed.push({
        providerId: state.currentProviderId,
        modelId: state.currentModelId,
        variant: state.currentVariant,
      })
    })

    try {
      useConfigStore.getState().setProviderModel("opencode", "builder-model", "high")
    } finally {
      unsubscribe()
    }

    expect(useConfigStore.getState().currentProviderId).toBe("opencode")
    expect(useConfigStore.getState().currentModelId).toBe("builder-model")
    expect(useConfigStore.getState().currentVariant).toBe("high")
    expect(observed).toEqual([
      { providerId: "opencode", modelId: "builder-model", variant: "high" },
    ])
  })

  test("leaves an active session selection unchanged when the configured default agent changes", () => {
    useSessionUIStore.setState({ currentSessionId: "session-1" })

    useConfigStore.getState().setSettingsDefaultAgent("Builder")

    expect(useConfigStore.getState().currentAgentName).toBe("Orchestrator")
    expect(useConfigStore.getState().currentProviderId).toBe("anthropic")
    expect(useConfigStore.getState().currentModelId).toBe("claude")
    expect(useConfigStore.getState().currentVariant).toBe(undefined)
  })
})

describe("mergeRuntimeAgentsWithConfigOverrides", () => {
  test("applies config-backed model and variant overrides to runtime agents", () => {
    const runtimeAgents = [{
      name: "Builder",
      mode: "primary",
      model: { providerID: "opencode", modelID: "small" },
      variant: "low",
      permission: [],
      options: {},
    }] as Agent[]
    const configAgents = [{
      name: "Builder",
      mode: "primary",
      model: { providerID: "opencode", modelID: "builder-model" },
      variant: "high",
      modelRefs: ["opencode/builder-model", "anthropic/claude"],
      councillors: [{ model: "anthropic/claude", variant: "medium" }],
      permission: [],
      options: {},
    }] as unknown as Agent[]

    const merged = mergeRuntimeAgentsWithConfigOverrides(runtimeAgents, configAgents)

    expect(merged[0].model).toEqual({ providerID: "opencode", modelID: "builder-model" })
    expect((merged[0] as Agent & { variant?: string }).variant).toBe("high")
    expect((merged[0] as Agent & { modelRefs?: string[] }).modelRefs).toEqual([
      "opencode/builder-model",
      "anthropic/claude",
    ])
    expect((merged[0] as Agent & { councillors?: unknown[] }).councillors).toEqual([
      { model: "anthropic/claude", variant: "medium" },
    ])
  })

  test("keeps metadata-only config agents out of the executable runtime list", () => {
    const runtimeAgents = [{
      name: "Builder",
      mode: "primary",
      model: { providerID: "opencode", modelID: "small" },
      permission: [],
      options: {},
    }] as Agent[]
    const configAgents = [{
      name: "Orchestrator",
      mode: "primary",
      model: { providerID: "anthropic", modelID: "claude" },
      permission: [],
      options: {},
    }] as Agent[]

    const merged = mergeRuntimeAgentsWithConfigOverrides(runtimeAgents, configAgents)

    expect(merged.map((agent) => agent.name)).toEqual(["Builder"])
  })

  test("keeps synced packaged agents selectable when they are present in runtime", () => {
    const runtimeAgents = [
      {
        name: "builder",
        mode: "primary",
        model: { providerID: "opencode", modelID: "small" },
        permission: [],
        options: {},
      },
      {
        name: "orchestrator",
        mode: "primary",
        model: { providerID: "opencode", modelID: "small" },
        permission: [],
        options: {},
      },
    ] as Agent[]
    const configAgents = [{
      name: "orchestrator",
      mode: "primary",
      model: { providerID: "anthropic", modelID: "claude" },
      variant: "high",
      permission: [],
      options: {},
    }] as Agent[]

    const merged = mergeRuntimeAgentsWithConfigOverrides(runtimeAgents, configAgents)

    expect(merged.map((agent) => agent.name)).toEqual(["builder", "orchestrator"])
    expect(merged[1].model).toEqual({ providerID: "anthropic", modelID: "claude" })
    expect((merged[1] as Agent & { variant?: string }).variant).toBe("high")
  })

  test("keeps runtime execution metadata when applying config-backed model overrides", () => {
    const runtimeAgents = [{
      name: "explorer",
      mode: "subagent",
      model: { providerID: "opencode", modelID: "small" },
      permission: [{ id: "bash", action: "allow" }],
      options: { hidden: true },
    }] as unknown as Agent[]
    const configAgents = [{
      name: "explorer",
      mode: "primary",
      model: { providerID: "anthropic", modelID: "claude" },
      variant: null,
      permission: [],
      options: {},
    }] as unknown as Agent[]

    const merged = mergeRuntimeAgentsWithConfigOverrides(runtimeAgents, configAgents)
    const explorer = merged[0] as Agent & { variant?: string; options?: { hidden?: boolean } }

    expect(explorer.model).toEqual({ providerID: "anthropic", modelID: "claude" })
    expect(explorer.variant).toBe(undefined)
    expect(explorer.mode).toBe("subagent")
    expect(explorer.permission).toEqual([{ id: "bash", action: "allow" }])
    expect(explorer.options?.hidden).toBe(true)
  })
})
