import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const chatInputSource = readFileSync(
  fileURLToPath(new URL("./ChatInput.tsx", import.meta.url)),
  "utf8",
)

describe("ChatInput session directory reads", () => {
  test("derives currentSessionDirectory from the selected session", () => {
    expect(chatInputSource).toContain(
      "currentSessionId ? s.getDirectoryForSession(currentSessionId) : null",
    )
  })

  test("passes currentSessionDirectory into session message hooks", () => {
    expect(
      chatInputSource.match(/useSessionMessagesResolved\([\s\S]*currentSessionDirectory \?\? undefined/) ?? [],
    ).toHaveLength(1)
    expect(
      chatInputSource.match(/useUserMessageHistory\([\s\S]*currentSessionDirectory \?\? undefined/) ?? [],
    ).toHaveLength(1)
  })
})
