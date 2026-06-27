import { describe, expect, test } from "bun:test"
import {
  addPendingPartDelta,
  hasPendingPartDeltasForMessages,
  type PendingPartDeltaStore,
} from "./pending-part-deltas"

const DIR = "/repo/project"

const seed = (): PendingPartDeltaStore => {
  const store: PendingPartDeltaStore = new Map()
  addPendingPartDelta(store, DIR, { messageID: "msgA", partID: "partX", field: "text", delta: "hello" }, 1_000)
  return store
}

describe("hasPendingPartDeltasForMessages", () => {
  test("true when a buffered delta targets one of the given messages", () => {
    expect(hasPendingPartDeltasForMessages(seed(), DIR, ["msgA"])).toBe(true)
    expect(hasPendingPartDeltasForMessages(seed(), DIR, new Set(["other", "msgA"]))).toBe(true)
  })

  test("false when no buffered delta targets the given messages", () => {
    expect(hasPendingPartDeltasForMessages(seed(), DIR, ["msgB"])).toBe(false)
  })

  test("false for a different directory (buffer is directory-scoped)", () => {
    expect(hasPendingPartDeltasForMessages(seed(), "/repo/other", ["msgA"])).toBe(false)
  })

  test("false for empty inputs / global directory / empty store", () => {
    expect(hasPendingPartDeltasForMessages(seed(), DIR, [])).toBe(false)
    expect(hasPendingPartDeltasForMessages(seed(), "global", ["msgA"])).toBe(false)
    expect(hasPendingPartDeltasForMessages(new Map(), DIR, ["msgA"])).toBe(false)
  })

  test("does not match a messageID that is only a substring of a buffered key segment", () => {
    // 'msg' must not match 'msgA' — split-based exact segment comparison.
    expect(hasPendingPartDeltasForMessages(seed(), DIR, ["msg"])).toBe(false)
  })
})
