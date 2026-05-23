import { describe, expect, test } from "bun:test"

import { getEditableComposerTargetKey } from "./chatInputFocusTarget"

describe("getEditableComposerTargetKey", () => {
  test("uses the active session as the focus target when a session is selected", () => {
    expect(getEditableComposerTargetKey("session-1", "draft-1", true)).toBe("session:session-1")
  })

  test("uses the active draft as the focus target when a new chat draft is editable", () => {
    expect(getEditableComposerTargetKey(null, "draft-1", true)).toBe("draft:draft-1")
  })

  test("returns null when no editable composer target exists", () => {
    expect(getEditableComposerTargetKey(null, "draft-1", false)).toBeNull()
    expect(getEditableComposerTargetKey(null, null, true)).toBeNull()
  })
})
