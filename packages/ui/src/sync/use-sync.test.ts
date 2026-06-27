import { describe, expect, test } from "bun:test"
import { normalizeMessageFetchLimit, unwrapMessageRecordsResult } from "./message-fetch"

describe("message fetch hardening", () => {
  test("clamps message fetch limits to the default page size when metadata is poisoned", () => {
    expect(normalizeMessageFetchLimit(0)).toBe(200)
    expect(normalizeMessageFetchLimit(-10)).toBe(200)
    expect(normalizeMessageFetchLimit(Number.NaN)).toBe(200)
    expect(normalizeMessageFetchLimit(30)).toBe(30)
  })

  test("throws retryable errors for SDK message response errors", () => {
    expect(() => unwrapMessageRecordsResult({
      error: { message: "OpenCode API unavailable" },
      response: { status: 503 },
    })).toThrow("session.messages failed (503): OpenCode API unavailable")

    try {
      unwrapMessageRecordsResult({
        error: "OpenCode API unavailable",
        response: { status: 503 },
      })
    } catch (error) {
      expect((error as Error & { status?: number }).status).toBe(503)
    }
  })
})
