import { beforeEach, describe, expect, mock, test } from "bun:test"

import {
  buildResponseStyleInstruction,
  cacheResponseStyleInstructionFromSettings,
  clearResponseStyleInstructionCacheForTests,
  getCachedResponseStyleInstruction,
  isResponseStyleInstructionLoaded,
} from "./responseStyle"

describe("response style startup cache", () => {
  beforeEach(() => {
    clearResponseStyleInstructionCacheForTests()
  })

  test("caches the same instruction the old submit-time settings fetch built", () => {
    const settings = {
      responseStyleEnabled: true,
      responseStylePreset: "concise",
      responseStyleCustomInstructions: "",
    }

    const expected = buildResponseStyleInstruction({
      enabled: true,
      preset: "concise",
      customInstructions: "",
    })

    expect(cacheResponseStyleInstructionFromSettings(settings)).toBe(expected)
    expect(getCachedResponseStyleInstruction()).toBe(expected)
    expect(isResponseStyleInstructionLoaded()).toBe(true)
  })

  test("reads cached instructions synchronously without fetching settings on submit", () => {
    let fetchCalls = 0
    const fetchMock = mock(() => {
      fetchCalls += 1
      throw new Error("submit must not fetch settings")
    })
    const previousFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      cacheResponseStyleInstructionFromSettings({
        responseStyleEnabled: true,
        responseStylePreset: "custom",
        responseStyleCustomInstructions: "Answer with one sentence.",
      })

      expect(getCachedResponseStyleInstruction()).toBe("Answer with one sentence.")
      expect(fetchCalls).toBe(0)
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
