import { describe, expect, test } from "bun:test"
import { getGitLog, getGitWorktreeBootstrapStatus, resolveGitApiBaseOrigin } from "./gitApiHttp"

type TestWindow = {
  location: { origin: string }
  __OPENCHAMBER_DESKTOP_SERVER__?: {
    origin: string
    opencodePort: number | null
    apiPrefix: string
    cliAvailable: boolean
  }
}

const originalWindow = globalThis.window
const originalFetch = globalThis.fetch

const setTestWindow = (windowValue: TestWindow): void => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  })
}

const restoreGlobals = (): void => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  })
  globalThis.fetch = originalFetch
}

describe("gitApiHttp URL routing", () => {
  test("uses the Vite renderer origin in Electron dev so /api goes through the dev proxy", async () => {
    try {
      setTestWindow({
        location: { origin: "http://127.0.0.1:5173" },
        __OPENCHAMBER_DESKTOP_SERVER__: {
          origin: "http://127.0.0.1:3901",
          opencodePort: null,
          apiPrefix: "/api",
          cliAvailable: true,
        },
      })
      const requestedUrls: string[] = []
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        requestedUrls.push(String(input))
        return new Response(JSON.stringify({ status: "ready", error: null, updatedAt: 1 }), { status: 200 })
      }) as typeof fetch

      expect(resolveGitApiBaseOrigin()).toBe("http://127.0.0.1:5173")
      await getGitWorktreeBootstrapStatus("/Users/zoubair/Repositories/DevRyan")

      expect(requestedUrls).toEqual([
        "http://127.0.0.1:5173/api/git/worktrees/bootstrap-status?directory=%2FUsers%2Fzoubair%2FRepositories%2FDevRyan",
      ])
    } finally {
      restoreGlobals()
    }
  })

  test("uses the injected desktop origin when the renderer is served by the packaged local server", () => {
    try {
      setTestWindow({
        location: { origin: "http://127.0.0.1:57123" },
        __OPENCHAMBER_DESKTOP_SERVER__: {
          origin: "http://127.0.0.1:57123",
          opencodePort: null,
          apiPrefix: "/api",
          cliAvailable: true,
        },
      })

      expect(resolveGitApiBaseOrigin()).toBe("http://127.0.0.1:57123")
    } finally {
      restoreGlobals()
    }
  })

  test("uses git log JSON error messages when available", async () => {
    try {
      setTestWindow({
        location: { origin: "http://127.0.0.1:5173" },
      })
      globalThis.fetch = (async () => (
        new Response(JSON.stringify({ error: "Base ref not found" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "content-type": "application/json" },
        })
      )) as typeof fetch

      let thrown: unknown = null
      try {
        await getGitLog("/repo", { from: "main" })
      } catch (error) {
        thrown = error
      }
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      expect(message.includes("Base ref not found")).toBe(true)
    } finally {
      restoreGlobals()
    }
  })
})
