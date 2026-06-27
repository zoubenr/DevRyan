import { describe, expect, test } from "bun:test"
import { resolveQueuedAutoSendStatusType, resolveQueuedSessionStatusType } from "./queuedMessageAutoSendStatus"

describe("queued message auto-send status resolution", () => {
  test("uses aggregated live status for sessions outside the current directory", () => {
    expect(resolveQueuedSessionStatusType("session-b", {
      "session-a": { type: "busy" },
      "session-b": { type: "idle" },
    })).toBe("idle")
  })

  test("does not default a known busy session to idle when current-directory status is missing", () => {
    expect(resolveQueuedSessionStatusType("session-b", {
      "session-b": { type: "busy" },
    })).toBe("busy")
  })

  test("keeps a queued session unknown until any live status source has observed it", () => {
    expect(resolveQueuedSessionStatusType("session-b", {})).toBe("unknown")
    expect(resolveQueuedAutoSendStatusType("session-b", {}, undefined)).toBe("unknown")
  })

  test("uses any-directory busy status before aggregated idle status", () => {
    expect(resolveQueuedAutoSendStatusType("session-a", {
      "session-a": { type: "idle" },
    }, { type: "busy" })).toBe("busy")
  })

  test("allows dispatch after the queued session transitions from busy to idle", () => {
    expect(resolveQueuedAutoSendStatusType("session-a", {
      "session-a": { type: "idle" },
    }, { type: "idle" })).toBe("idle")
  })

  test("treats pending blocking requests as blocked even when status is idle", () => {
    expect(resolveQueuedAutoSendStatusType("session-a", {
      "session-a": { type: "idle" },
    }, { type: "idle" }, 1)).toBe("blocked")
  })
})
