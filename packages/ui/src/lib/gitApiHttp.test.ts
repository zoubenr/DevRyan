import { describe, expect, test } from "bun:test"
import { getGitLog, getGitStatus, getGitWorktreeBootstrapStatus, getPrimaryWorktreeRoot, gitFetch, resolveGitApiBaseOrigin } from "./gitApiHttp"

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

  test("requests primary worktree roots through the Git route contract", async () => {
    try {
      setTestWindow({
        location: { origin: "http://127.0.0.1:5173" },
      })
      const requestedUrls: string[] = []
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        requestedUrls.push(String(input))
        return new Response(JSON.stringify({ root: "/repo" }), { status: 200 })
      }) as typeof fetch

      const root = await getPrimaryWorktreeRoot("/repo/worktree")
      expect(root).toBe("/repo")
      expect(requestedUrls).toEqual([
        "http://127.0.0.1:5173/api/git/worktree-root?directory=%2Frepo%2Fworktree",
      ])
    } finally {
      restoreGlobals()
    }
  })

  test("clears in-flight status requests after fetch invalidation", async () => {
    try {
      setTestWindow({
        location: { origin: "http://127.0.0.1:5173" },
      })
      const directory = `/repo-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const statusResponses: Array<(response: Response) => void> = []
      const requestedUrls: string[] = []
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requestedUrls.push(`${init?.method || "GET"} ${url}`)
        if (url.includes("/api/git/status")) {
          return await new Promise<Response>((resolve) => {
            statusResponses.push(resolve)
          })
        }
        if (url.includes("/api/git/fetch")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 })
        }
        return new Response("not found", { status: 404 })
      }) as typeof fetch

      const firstStatus = getGitStatus(directory)
      await Promise.resolve()
      await gitFetch(directory, { remote: "origin" })
      const secondStatus = getGitStatus(directory)

      expect(requestedUrls.filter((url) => url.includes("/api/git/status"))).toHaveLength(2)

      statusResponses[0]?.(new Response(JSON.stringify({
        current: "main",
        tracking: "origin/main",
        ahead: 0,
        behind: 0,
        files: [],
        isClean: true,
      }), { status: 200 }))
      statusResponses[1]?.(new Response(JSON.stringify({
        current: "main",
        tracking: "origin/main",
        ahead: 1,
        behind: 0,
        files: [],
        isClean: true,
      }), { status: 200 }))

      const [, next] = await Promise.all([firstStatus, secondStatus])
      expect(next.ahead).toBe(1)
    } finally {
      restoreGlobals()
    }
  })
})
