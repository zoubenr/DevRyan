import { describe, expect, test } from "bun:test"

import { useSessionDisplayStore } from "./useSessionDisplayStore"

describe("useSessionDisplayStore", () => {
  test("hides the recent section by default for fresh storage", () => {
    expect(useSessionDisplayStore.getState().showRecentSection).toBe(false)
  })
})
