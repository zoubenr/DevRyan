import { beforeEach, describe, expect, mock, test } from "bun:test"

let getProvidersImpl: () => Promise<unknown>
let listAgentsStrictImpl: () => Promise<unknown>

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    setDirectory: () => {},
    getDirectory: () => "/repo",
    withDirectory: (_directory: string | undefined | null, fn: () => Promise<unknown>) => fn(),
    getProviders: () => getProvidersImpl(),
    listAgentsStrict: () => listAgentsStrictImpl(),
    checkHealth: () => Promise.resolve(true),
  },
}))

const { useConfigStore } = await import("./useConfigStore")

describe("useConfigStore startup load status", () => {
  beforeEach(() => {
    console.error = mock(() => {}) as unknown as typeof console.error
    getProvidersImpl = () => Promise.resolve({ providers: [], default: {} })
    listAgentsStrictImpl = () => Promise.resolve([])
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/config/agents")) {
        return Promise.resolve(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      }
      if (url === "/api/config/settings") {
        return Promise.resolve(new Response(JSON.stringify({
          responseStyleEnabled: false,
          responseStylePreset: "concise",
          responseStyleCustomInstructions: "",
        }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }) as unknown as typeof fetch

    useConfigStore.setState({
      activeDirectoryKey: "__global__",
      directoryScoped: {},
      providers: [],
      agents: [],
      providersLoadStatus: "idle",
      providersLoadError: undefined,
      agentsLoadStatus: "idle",
      agentsLoadError: undefined,
      responseStyleInstructionLoaded: false,
      isConnected: true,
      isInitialized: false,
    })
  })

  test("provider transient failures set error state and retry can recover to a valid empty list", async () => {
    getProvidersImpl = () => Promise.reject(new Error("provider 503"))

    await useConfigStore.getState().loadProviders()

    expect(useConfigStore.getState().providersLoadStatus).toBe("error")
    expect(useConfigStore.getState().providersLoadError).toContain("provider 503")

    getProvidersImpl = () => Promise.resolve({ providers: [], default: {} })

    await useConfigStore.getState().loadProviders()

    expect(useConfigStore.getState().providersLoadStatus).toBe("ready")
    expect(useConfigStore.getState().providersLoadError).toBe(undefined)
    expect(useConfigStore.getState().providers).toEqual([])
  })

  test("agent transient failures set error state and retry can recover to a valid empty list", async () => {
    listAgentsStrictImpl = () => Promise.reject(new Error("agent 503"))

    const failed = await useConfigStore.getState().loadAgents()

    expect(failed).toBe(false)
    expect(useConfigStore.getState().agentsLoadStatus).toBe("error")
    expect(useConfigStore.getState().agentsLoadError).toContain("agent 503")

    listAgentsStrictImpl = () => Promise.resolve([])

    const recovered = await useConfigStore.getState().loadAgents()

    expect(recovered).toBe(true)
    expect(useConfigStore.getState().agentsLoadStatus).toBe("ready")
    expect(useConfigStore.getState().agentsLoadError).toBe(undefined)
    expect(useConfigStore.getState().agents).toEqual([])
    expect(useConfigStore.getState().responseStyleInstructionLoaded).toBe(true)
  })
})
