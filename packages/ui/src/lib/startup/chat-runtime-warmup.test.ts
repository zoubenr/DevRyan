import { describe, expect, test } from "bun:test"

import { warmChatRuntime } from "./chat-runtime-warmup"

describe("chat runtime warmup", () => {
  test("returns ready when every warmup task resolves", async () => {
    const result = await warmChatRuntime({
      timeoutMs: 100,
      tasks: [
        () => Promise.resolve("markdown"),
        () => Promise.resolve("tools"),
      ],
    })

    expect(result.status).toBe("ready")
    expect(result.timedOut).toBe(false)
  })

  test("does not fail startup when warmup exceeds the timeout", async () => {
    const result = await warmChatRuntime({
      timeoutMs: 1,
      tasks: [
        () => new Promise((resolve) => setTimeout(resolve, 25)),
      ],
    })

    expect(result.status).toBe("ready")
    expect(result.timedOut).toBe(true)
  })
})
