import { describe, expect, test } from "bun:test"
import { shouldShowPwaInstallToast } from "./pwaInstallPromptDecision"

describe("PWA install prompt decision", () => {
  test("does not show after persistent dismissal", () => {
    expect(shouldShowPwaInstallToast({
      persistentDismissedValue: "true",
      sessionShownValue: null,
      hasActiveToast: false,
    })).toBe(false)
  })

  test("does not show after this tab has already shown it", () => {
    expect(shouldShowPwaInstallToast({
      persistentDismissedValue: null,
      sessionShownValue: "true",
      hasActiveToast: false,
    })).toBe(false)
  })

  test("does not show while an install toast is already active", () => {
    expect(shouldShowPwaInstallToast({
      persistentDismissedValue: null,
      sessionShownValue: null,
      hasActiveToast: true,
    })).toBe(false)
  })

  test("shows when storage values are present but not the true sentinel", () => {
    expect(shouldShowPwaInstallToast({
      persistentDismissedValue: "false",
      sessionShownValue: "dismissed",
      hasActiveToast: false,
    })).toBe(true)
  })
})
