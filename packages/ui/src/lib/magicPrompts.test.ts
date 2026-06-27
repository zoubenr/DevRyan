import { beforeEach, describe, expect, test } from "bun:test"
import {
  fetchMagicPromptOverrides,
  invalidateMagicPromptOverridesCache,
  MAGIC_PROMPT_DEFINITIONS,
} from "./magicPrompts"

const originalFetch = globalThis.fetch

describe("magic prompt catalog", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
    invalidateMagicPromptOverridesCache()
  })

  test("commit generation exposes the same two-section shape as PR generation", () => {
    const commitPromptIds = MAGIC_PROMPT_DEFINITIONS
      .filter((definition) => definition.id.startsWith("git.commit."))
      .map((definition) => definition.id)

    expect(commitPromptIds).toEqual([
      "git.commit.generate.visible",
      "git.commit.generate.instructions",
    ])

    const prPromptIds = MAGIC_PROMPT_DEFINITIONS
      .filter((definition) => definition.id.startsWith("git.pr.generate."))
      .map((definition) => definition.id)

    expect(prPromptIds).toEqual([
      "git.pr.generate.visible",
      "git.pr.generate.instructions",
    ])
  })

  test("deprecated commit prompt overrides are filtered from loaded payloads", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: 1,
      overrides: {
        "git.commit.draft.visible": "old draft visible",
        "git.commit.draft.instructions": "old draft instructions",
        "git.commit.plan.visible": "old plan visible",
        "git.commit.plan.instructions": "old plan instructions",
        "git.commit.generate.visible": "new commit visible",
        "git.pr.generate.visible": "pr visible",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })

    const overrides = await fetchMagicPromptOverrides()

    expect(overrides).toEqual({
      "git.commit.generate.visible": "new commit visible",
      "git.pr.generate.visible": "pr visible",
    })
  })
})
