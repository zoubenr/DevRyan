import { describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { bootstrapGlobal } from "./bootstrap"
import type { GlobalState } from "./types"

const originalFetch = globalThis.fetch

const failingSdk = (message = "Failed to fetch"): OpencodeClient => {
  const fail = async () => ({ error: { message } })
  return {
    path: { get: fail },
    global: { config: { get: fail } },
    project: { list: fail },
    provider: { list: fail },
  } as unknown as OpencodeClient
}

const successfulSdk = (): OpencodeClient => ({
  path: { get: async () => ({ data: { state: "/state", config: "/config", worktree: "/", directory: "/", home: "/home" } }) },
  global: { config: { get: async () => ({ data: {} }) } },
  project: { list: async () => ({ data: [] }) },
  provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
} as unknown as OpencodeClient)

const capturePatches = () => {
  const patches: Array<Partial<GlobalState>> = []
  return {
    patches,
    set: (patch: Partial<GlobalState>) => {
      patches.push(patch)
    },
  }
}

describe("bootstrapGlobal", () => {
  test("keeps transient all-endpoint failures retryable when health has no terminal error", async () => {
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify({
        openCodeRunning: true,
        lastOpenCodeError: null,
      }), { status: 200 })) as typeof fetch
      const { patches, set } = capturePatches()

      const result = await bootstrapGlobal(failingSdk(), set)

      expect(result).toEqual({ ready: false, retryable: true, error: "path.get failed: Failed to fetch" })
      expect(patches.at(-1)).toEqual({ ready: false, error: undefined })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("surfaces authoritative health failures instead of retrying forever", async () => {
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify({
        openCodeRunning: true,
        lastOpenCodeError: "OpenCode crashed during startup",
      }), { status: 200 })) as typeof fetch
      const { patches, set } = capturePatches()

      const result = await bootstrapGlobal(failingSdk(), set)

      expect(result).toEqual({ ready: false, retryable: false, error: "OpenCode crashed during startup" })
      expect(patches.at(-1)).toEqual({ ready: true, error: { type: "init", message: "OpenCode crashed during startup" } })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("marks global sync ready after successful requests", async () => {
    const { patches, set } = capturePatches()

    const result = await bootstrapGlobal(successfulSdk(), set)

    expect(result).toEqual({ ready: true, retryable: false })
    expect(patches.at(-1)).toEqual({ ready: true, error: undefined })
  })
})
