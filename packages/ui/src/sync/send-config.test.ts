import { beforeEach, describe, expect, test } from "bun:test"
import { useConfigStore } from "@/stores/useConfigStore"
import { useSelectionStore } from "./selection-store"
import {
  resolveCurrentSendConfig,
  resolveDraftSendSelection,
  resolveSessionSendConfig,
  resolveSessionSendConfigSnapshot,
  type SendConfigResolverSnapshot,
} from "./send-config"

const snapshot = (overrides: Partial<SendConfigResolverSnapshot> = {}): SendConfigResolverSnapshot => ({
  currentAgentName: "builder",
  currentProviderId: "openai",
  currentModelId: "gpt-5.5",
  currentVariant: "medium",
  settingsDefaultAgent: "builder",
  lastUsedProvider: null,
  agents: [
    {
      name: "builder",
      mode: "primary",
      model: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
      variant: "high",
    },
    {
      name: "reviewer",
      mode: "primary",
      model: { providerID: "openai", modelID: "gpt-5.2" },
      variant: "low",
    },
  ],
  providers: [
    {
      id: "openai",
      models: [
        { id: "gpt-5.5", variants: { medium: {}, high: {} } },
        { id: "gpt-5.2", variants: { low: {}, medium: {} } },
      ],
    },
    {
      id: "anthropic",
      models: [{ id: "claude-sonnet-4-5", variants: { high: {}, medium: {} } }],
    },
  ],
  sessionAgentSelection: null,
  contextSessionAgentSelection: null,
  contextCurrentAgent: undefined,
  sessionModelSelection: null,
  contextSessionModelSelection: null,
  sessionAgentModelSelection: null,
  contextSessionAgentModelSelection: null,
  sessionAgentModelVariant: undefined,
  contextSessionAgentModelVariant: undefined,
  planMode: false,
  ...overrides,
})

describe("send config resolution", () => {
  beforeEach(() => {
    useConfigStore.setState({
      currentAgentName: undefined,
      currentProviderId: "",
      currentModelId: "",
      currentVariant: undefined,
      agents: [],
      providers: [],
    })
    useSelectionStore.setState({
      sessionModelSelections: new Map(),
      sessionAgentSelections: new Map(),
      sessionPlanModeSelections: new Map(),
      sessionAgentModelSelections: new Map(),
      draftModelSelections: new Map(),
      draftAgentSelections: new Map(),
      draftAgentModelSelections: new Map(),
      draftAgentModelVariantSelections: new Map(),
      lastUsedProvider: null,
      defaultPlanModeSelection: false,
      draftPlanModeSelection: false,
    })
    useSelectionStore.getState().setPlanModeSelection(null, false)
  })

  test("uses the default agent model for a new draft when no explicit agent or valid input model is selected", () => {
    const result = resolveDraftSendSelection({
      requestedAgent: undefined,
      currentAgent: undefined,
      settingsDefaultAgent: "builder",
      agents: snapshot().agents,
      providers: snapshot().providers,
      inputProviderID: "missing-provider",
      inputModelID: "missing-model",
      inputVariant: undefined,
      currentProviderID: "missing-current-provider",
      currentModelID: "missing-current-model",
      currentVariant: undefined,
    })

    expect(result).toEqual({
      agent: "builder",
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
      variant: "high",
    })
  })

  test("uses the current model before the default agent model for a new draft", () => {
    const result = resolveDraftSendSelection({
      requestedAgent: undefined,
      currentAgent: "builder",
      settingsDefaultAgent: "builder",
      agents: snapshot().agents,
      providers: snapshot().providers,
      inputProviderID: "missing-provider",
      inputModelID: "missing-model",
      inputVariant: undefined,
      currentProviderID: "openai",
      currentModelID: "gpt-5.5",
      currentVariant: "medium",
    })

    expect(result).toEqual({
      agent: "builder",
      providerID: "openai",
      modelID: "gpt-5.5",
      variant: "medium",
    })
  })

  test("preserves an explicit draft model selection instead of applying the default agent model", () => {
    const input = {
      requestedAgent: undefined,
      currentAgent: undefined,
      settingsDefaultAgent: "builder",
      agents: snapshot().agents,
      providers: snapshot().providers,
      inputProviderID: "openai",
      inputModelID: "gpt-5.2",
      inputVariant: "low",
      currentProviderID: "anthropic",
      currentModelID: "claude-sonnet-4-5",
      currentVariant: "high",
      draftAgentSelection: "reviewer",
      draftModelSelection: { providerId: "openai", modelId: "gpt-5.2" },
      draftAgentModelSelection: { providerId: "openai", modelId: "gpt-5.2" },
      draftAgentModelVariant: "low",
    }

    const result = resolveDraftSendSelection(input)

    expect(result).toEqual({
      agent: "reviewer",
      providerID: "openai",
      modelID: "gpt-5.2",
      variant: "low",
    })
  })

  test("uses persisted draft send config before legacy draft and live defaults", () => {
    const result = resolveDraftSendSelection({
      requestedAgent: undefined,
      currentAgent: "builder",
      settingsDefaultAgent: "builder",
      agents: snapshot().agents,
      providers: snapshot().providers,
      inputProviderID: "openai",
      inputModelID: "gpt-5.5",
      inputVariant: "medium",
      currentProviderID: "anthropic",
      currentModelID: "claude-sonnet-4-5",
      currentVariant: "high",
      draftAgentSelection: "builder",
      draftModelSelection: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      draftAgentModelSelection: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      draftAgentModelVariant: "high",
      draftSendConfig: {
        providerID: "openai",
        modelID: "gpt-5.2",
        agent: "reviewer",
        variant: "low",
        planMode: true,
      },
    })

    expect(result).toEqual({
      agent: "reviewer",
      providerID: "openai",
      modelID: "gpt-5.2",
      variant: "low",
    })
  })

  test("preserves captured queue config over live session selections", () => {
    const result = resolveSessionSendConfigSnapshot(snapshot({
      sessionAgentSelection: "builder",
      sessionAgentModelSelection: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      sessionAgentModelVariant: "high",
    }), {
      providerID: "openai",
      modelID: "gpt-5.2",
      agent: "reviewer",
      variant: "low",
      planMode: true,
    })

    expect(result).toEqual({
      providerID: "openai",
      modelID: "gpt-5.2",
      agent: "reviewer",
      variant: "low",
      planMode: true,
    })
  })

  test("uses session agent model and thinking for continuation when no captured config is provided", () => {
    const result = resolveSessionSendConfigSnapshot(snapshot({
      sessionAgentSelection: "builder",
      sessionModelSelection: { providerId: "openai", modelId: "gpt-5.5" },
      sessionAgentModelSelection: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      sessionAgentModelVariant: "high",
      planMode: true,
    }))

    expect(result).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
      agent: "builder",
      variant: "high",
      planMode: true,
    })
  })

  test("resolves current draft send config when no session is active", () => {
    useConfigStore.setState({
      currentProviderId: "openai",
      currentModelId: "gpt-5.5",
      currentAgentName: "builder",
      currentVariant: "medium",
    })
    useSelectionStore.getState().setPlanModeSelection(null, true)

    expect(resolveCurrentSendConfig(null)).toEqual({
      providerID: "openai",
      modelID: "gpt-5.5",
      agent: "builder",
      variant: "medium",
      planMode: true,
    })
  })

  test("resolves live session config through the same snapshot ordering", () => {
    useConfigStore.setState({
      currentProviderId: "openai",
      currentModelId: "gpt-5.5",
      currentAgentName: "reviewer",
      currentVariant: "medium",
      agents: [],
      providers: [],
    })
    const selection = useSelectionStore.getState()
    selection.saveSessionAgentSelection("session-live", "builder")
    selection.saveSessionModelSelection("session-live", "openai", "gpt-5.2")
    selection.saveAgentModelForSession("session-live", "builder", "anthropic", "claude-sonnet-4-5")
    selection.saveAgentModelVariantForSession("session-live", "builder", "anthropic", "claude-sonnet-4-5", "high")
    selection.setPlanModeSelection("session-live", true)

    expect(resolveSessionSendConfig("session-live")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
      agent: "builder",
      variant: "high",
      planMode: true,
    })
  })
})
