import { describe, expect, test } from "bun:test"
import { getPlanIndicatorTone, nextPlanIndicatorEntry } from "./plan-indicator"

describe("getPlanIndicatorTone", () => {
  test("maps every plan lifecycle state to orange or green", () => {
    expect(getPlanIndicatorTone("proposed")).toBe("warning")
    expect(getPlanIndicatorTone("implementing")).toBe("warning")
    expect(getPlanIndicatorTone("completed")).toBe("success")
  })
})

describe("nextPlanIndicatorEntry", () => {
  test("keeps implementation state orange instead of downgrading to proposed", () => {
    const current = { state: "implementing" as const, sourceMessageId: "msg_2" }

    expect(nextPlanIndicatorEntry(current, "proposed", "msg_2")).toBe(current)
  })

  test("only marks completed from an explicit completion transition", () => {
    const proposed = nextPlanIndicatorEntry(undefined, "proposed", "msg_2")
    const implementing = nextPlanIndicatorEntry(proposed, "implementing", "msg_2", "msg_3_user")

    expect(implementing).toEqual({
      state: "implementing",
      sourceMessageId: "msg_2",
      implementationMessageId: "msg_3_user",
    })
    expect(nextPlanIndicatorEntry(implementing, "completed", "msg_2")).toEqual({
      state: "completed",
      sourceMessageId: "msg_2",
      implementationMessageId: "msg_3_user",
    })
  })

  test("updates an existing implementing entry with the implementation user message id", () => {
    const implementing = { state: "implementing" as const, sourceMessageId: "msg_2" }

    expect(nextPlanIndicatorEntry(implementing, "implementing", "msg_2", "msg_3_user")).toEqual({
      state: "implementing",
      sourceMessageId: "msg_2",
      implementationMessageId: "msg_3_user",
    })
  })

  test("does not let an older rendered plan clobber a newer lifecycle", () => {
    const current = { state: "completed" as const, sourceMessageId: "msg_3" }

    expect(nextPlanIndicatorEntry(current, "proposed", "msg_2")).toBe(current)
    expect(nextPlanIndicatorEntry(current, "completed", "msg_2")).toBe(current)
  })

  test("allows a newer plan proposal after a completed plan", () => {
    const current = { state: "completed" as const, sourceMessageId: "msg_2" }

    expect(nextPlanIndicatorEntry(current, "proposed", "msg_3")).toEqual({
      state: "proposed",
      sourceMessageId: "msg_3",
    })
  })
})
