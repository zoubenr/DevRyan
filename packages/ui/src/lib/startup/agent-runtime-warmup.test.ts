import { beforeEach, describe, expect, test } from "bun:test"

import { warmAgentRuntime } from "./agent-runtime-warmup"

const originalFetch = globalThis.fetch

describe("agent runtime warmup", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  test("posts the active directory to the backend warmup route", async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    globalThis.fetch = (async (url, init) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return Response.json({
        status: "ready",
        timedOut: false,
        tasks: [],
      })
    }) as typeof fetch

    const result = await warmAgentRuntime({ directory: "/project", timeoutMs: 100 })

    expect(result.status).toBe("ready")
    expect(result.timedOut).toBe(false)
    expect(calls).toEqual([
      {
        url: "/api/startup/agent-runtime-warmup",
        body: { directory: "/project" },
      },
    ])
  })

  test("does not fail startup when the backend route is unavailable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("route unavailable")
    }) as typeof fetch

    const result = await warmAgentRuntime({ directory: "/project", timeoutMs: 100 })

    expect(result.status).toBe("ready")
    expect(result.timedOut).toBe(false)
    expect(result.errors).toEqual(["route unavailable"])
  })

  test("continues startup after the warmup timeout", async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as typeof fetch

    const result = await warmAgentRuntime({ directory: "/project", timeoutMs: 1 })

    expect(result.status).toBe("ready")
    expect(result.timedOut).toBe(true)
  })
})
