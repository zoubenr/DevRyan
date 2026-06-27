import { describe, expect, test } from "bun:test"
import { deriveSessionLifecycleStatus, type SessionLifecycleInputs } from "./sessionLifecycleStatus"

const base = (overrides: Partial<SessionLifecycleInputs> = {}): SessionLifecycleInputs => ({
  planModeOn: false,
  questionCount: 0,
  planIndicatorState: null,
  assistantActivity: 'idle',
  sdkSessionStatusError: null,
  ...overrides,
})

describe("deriveSessionLifecycleStatus", () => {
  test("returns error when SDK session-status reports an error", () => {
    const status = deriveSessionLifecycleStatus(base({
      sdkSessionStatusError: "connection lost",
      // Error must trump even active streaming + pending questions
      questionCount: 2,
      assistantActivity: 'streaming',
      planIndicatorState: 'implementing',
    }))
    expect(status).toEqual({ kind: 'error', message: 'connection lost' })
  })

  test("returns awaiting-question when questions are pending (over plan/streaming)", () => {
    const status = deriveSessionLifecycleStatus(base({
      questionCount: 3,
      assistantActivity: 'streaming',
      planIndicatorState: 'proposed',
    }))
    expect(status).toEqual({ kind: 'awaiting-question', questionCount: 3 })
  })

  test("returns plan-executing when indicator is implementing", () => {
    const status = deriveSessionLifecycleStatus(base({
      planIndicatorState: 'implementing',
      assistantActivity: 'streaming',
    }))
    expect(status.kind).toBe('plan-executing')
  })

  test("returns plan-proposed when indicator is proposed and assistant is idle", () => {
    const status = deriveSessionLifecycleStatus(base({
      planIndicatorState: 'proposed',
      assistantActivity: 'idle',
    }))
    expect(status.kind).toBe('plan-proposed')
  })

  test("returns plan-proposed when stale assistant activity is still present", () => {
    const status = deriveSessionLifecycleStatus(base({
      planIndicatorState: 'proposed',
      assistantActivity: 'streaming',
      planModeOn: true,
    }))
    expect(status.kind).toBe('plan-proposed')
  })

  test("returns streaming when assistant activity is active and no plan/question gate fires", () => {
    for (const activity of ['streaming', 'tooling', 'cooldown', 'permission'] as const) {
      const status = deriveSessionLifecycleStatus(base({
        assistantActivity: activity,
        planModeOn: false,
      }))
      expect(status).toEqual({ kind: 'streaming', planModeOn: false })
    }
  })

  test("returns idle with planModeOn carried through when nothing else fires", () => {
    const status = deriveSessionLifecycleStatus(base({ planModeOn: true }))
    expect(status).toEqual({ kind: 'idle', planModeOn: true })
  })

  test("plan-mode-on while idle stays idle (not streaming) — toggle alone isn't activity", () => {
    const status = deriveSessionLifecycleStatus(base({
      planModeOn: true,
      assistantActivity: 'idle',
      planIndicatorState: null,
    }))
    expect(status).toEqual({ kind: 'idle', planModeOn: true })
  })
})
