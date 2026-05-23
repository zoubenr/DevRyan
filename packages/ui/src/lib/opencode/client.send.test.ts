import { beforeEach, describe, expect, mock, test } from "bun:test"

const waitForWorktreeBootstrapCalls: string[] = []
const fetchCalls: Array<{ url: string; init?: RequestInit }> = []

mock.module("@/lib/worktrees/worktreeBootstrap", () => ({
  waitForWorktreeBootstrap: mock((directory: string) => {
    waitForWorktreeBootstrapCalls.push(directory)
    return Promise.resolve()
  }),
}))

;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = {
  location: {
    href: "http://127.0.0.1:5180/",
    origin: "http://127.0.0.1:5180",
  },
} as unknown as Window & typeof globalThis

const { opencodeClient } = await import("./client")

describe("opencode client sends", () => {
  beforeEach(() => {
    waitForWorktreeBootstrapCalls.length = 0
    fetchCalls.length = 0
    opencodeClient.setDirectory(undefined)
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return Promise.resolve(new Response(null, { status: 204 }))
    }) as typeof fetch
  })

  test("waits for worktree bootstrap before slash commands", async () => {
    await opencodeClient.sendCommand({
      id: "session-a",
      providerID: "provider-a",
      modelID: "model-a",
      command: "build",
      arguments: "now",
      directory: "/repo/project",
    })

    expect(waitForWorktreeBootstrapCalls).toEqual(["/repo/project"])
    expect(fetchCalls[0]?.url).toContain("/api/session/session-a/command")
    expect(fetchCalls[0]?.url).toContain("directory=%2Frepo%2Fproject")
  })

  test("sends Cursor SDK prompts without workspace repair", async () => {
    await opencodeClient.sendMessage({
      id: "session-cursor",
      providerID: "cursor-acp",
      modelID: "composer-2.5",
      text: "what model are you",
      directory: "/repo/cursor",
    })

    expect(fetchCalls.some((call) => call.url.includes("/api/provider/cursor-acp/workspace"))).toBe(false)
    expect(fetchCalls[0]?.url).toContain("/api/session/session-cursor/prompt_async")
  })

  test("does not add Cursor ACP compatibility instructions to prompt sends", async () => {
    await opencodeClient.sendMessage({
      id: "session-cursor",
      providerID: "cursor-acp",
      modelID: "composer-2.5",
      text: "move these fields",
      directory: "/repo/cursor",
      additionalParts: [{ text: "plan mode instruction", synthetic: true }],
    })

    const promptRequest = fetchCalls.find((call) => call.url.includes("/prompt_async"))
    const body = JSON.parse(String(promptRequest?.init?.body ?? "{}"))

    const partTexts = body.parts.map((part: { text?: string }) => part.text)
    expect(partTexts).toEqual([
      "move these fields",
      "plan mode instruction",
    ])
    expect(JSON.stringify(body)).not.toContain("Cursor ACP compatibility instructions")
  })

  test("does not repair workspace for non-Cursor prompt sends", async () => {
    await opencodeClient.sendMessage({
      id: "session-openai",
      providerID: "openai",
      modelID: "gpt-5.5",
      text: "hello",
      directory: "/repo/openai",
    })

    expect(fetchCalls.some((call) => call.url.includes("/api/provider/cursor-acp/workspace"))).toBe(false)
    expect(fetchCalls[0]?.url).toContain("/api/session/session-openai/prompt_async")
    const body = JSON.parse(String(fetchCalls[0]?.init?.body ?? "{}"))
    expect(body.parts.map((part: { text?: string }) => part.text)).toEqual(["hello"])
  })

  test("preserves raw PDF file parts", async () => {
    await opencodeClient.sendMessage({
      id: "session-pdf",
      providerID: "openai",
      modelID: "gpt-pdf",
      text: "read this PDF",
      directory: "/repo/pdf",
      files: [{
        type: "file",
        mime: "application/pdf",
        filename: "document.pdf",
        url: "data:application/pdf;base64,JVBERi0xLjQ=",
      }],
    })

    const body = JSON.parse(String(fetchCalls[0]?.init?.body ?? "{}"))
    const pdfPart = body.parts.find((part: { type?: string; mime?: string }) =>
      part.type === "file" && part.mime === "application/pdf"
    )
    expect(pdfPart).toEqual({
      type: "file",
      mime: "application/pdf",
      filename: "document.pdf",
      url: "data:application/pdf;base64,JVBERi0xLjQ=",
    })
  })

  test("does not call Cursor workspace repair across repeated sends", async () => {
    await opencodeClient.sendMessage({
      id: "session-cursor-a",
      providerID: "cursor-acp",
      modelID: "composer-2.5",
      text: "first",
      directory: "/repo/cached",
    })
    await opencodeClient.sendMessage({
      id: "session-cursor-b",
      providerID: "cursor-acp",
      modelID: "composer-2.5",
      text: "second",
      directory: "/repo/cached",
    })

    expect(fetchCalls.filter((call) => call.url.includes("/api/provider/cursor-acp/workspace"))).toHaveLength(0)
    expect(fetchCalls.filter((call) => call.url.includes("/prompt_async"))).toHaveLength(2)
  })

  test("returns null for direct session status fetch failures while wrappers coerce to empty maps", async () => {
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return Promise.resolve(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }))
    }) as typeof fetch

    expect(await opencodeClient.getSessionStatusForDirectory("/repo/project")).toBe(null)
    expect(await opencodeClient.getSessionStatus()).toEqual({})
    expect(await opencodeClient.getGlobalSessionStatus()).toEqual({})
  })
})
