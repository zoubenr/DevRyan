import { describe, expect, test } from "bun:test"

import {
  buildCommitWorkflowSafetyReport,
  isCommitWorkflowRuntimeNoisePath,
  shouldAutoSelectGitChange,
} from "./commitWorkflowSafety"

describe("commit workflow safety", () => {
  test("recognizes Superpowers brainstorm runtime state paths", () => {
    expect(isCommitWorkflowRuntimeNoisePath(".superpowers/brainstorm/58209/state/server-info")).toBe(true)
    expect(isCommitWorkflowRuntimeNoisePath(".superpowers/brainstorm/58209/state/server-stopped")).toBe(true)
    expect(isCommitWorkflowRuntimeNoisePath("src/app.ts")).toBe(false)
  })

  test("does not auto-select unselected brainstorm runtime state files", () => {
    expect(shouldAutoSelectGitChange({ path: ".superpowers/brainstorm/58209/state/server-info", index: "D", working_dir: " " })).toBe(false)
    expect(shouldAutoSelectGitChange({ path: "src/app.ts", index: "M", working_dir: " " })).toBe(true)
  })

  test("blocks staged paths outside the selected-file allowlist", () => {
    const report = buildCommitWorkflowSafetyReport({
      selectedPaths: ["src/app.ts"],
      statusFiles: [
        { path: "src/app.ts", index: " ", working_dir: "M" },
        { path: "src/other.ts", index: "A", working_dir: " " },
      ],
    })

    expect(report.blockingPaths).toEqual(["src/other.ts"])
    expect(report.runtimeNoisePaths).toEqual([])
  })

  test("warns about untracked runtime noise without blocking completed selected commits", () => {
    const report = buildCommitWorkflowSafetyReport({
      selectedPaths: ["src/app.ts"],
      statusFiles: [
        { path: ".superpowers/brainstorm/58209/state/server-stopped", index: "?", working_dir: "?" },
      ],
    })

    expect(report.blockingPaths).toEqual([])
    expect(report.runtimeNoisePaths).toEqual([".superpowers/brainstorm/58209/state/server-stopped"])
  })
})
