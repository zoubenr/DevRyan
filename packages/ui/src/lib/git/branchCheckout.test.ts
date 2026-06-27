import { describe, expect, mock, test } from "bun:test"

import type { GitAPI } from "@/lib/api/types"
import {
  checkoutBranchWithOptionalStash,
  normalizeCheckoutBranchName,
} from "./branchCheckout"

const createGit = () => {
  const calls: string[] = []
  const git = {
    checkoutBranch: mock(async (_directory: string, branch: string) => {
      calls.push(`checkout:${branch}`)
      return { success: true, branch }
    }),
    stash: mock(async () => {
      calls.push("stash")
      return { success: true }
    }),
    stashPop: mock(async () => {
      calls.push("stashPop")
      return { success: true }
    }),
  } as unknown as GitAPI
  return { git, calls }
}

describe("branch checkout helper", () => {
  test("normalizes remote-prefixed branch names for checkout", () => {
    expect(normalizeCheckoutBranchName("remotes/origin/main")).toBe("origin/main")
    expect(normalizeCheckoutBranchName(" main ")).toBe("main")
  })

  test("clean checkout calls checkout directly", async () => {
    const { git, calls } = createGit()

    const result = await checkoutBranchWithOptionalStash({
      git,
      directory: "/repo",
      branch: "main",
      status: { current: "feature", tracking: null, ahead: 0, behind: 0, files: [], isClean: true },
      restoreAfter: false,
    })

    expect(result).toEqual({ type: "checked-out", branch: "main", stashed: false, restored: false })
    expect(calls).toEqual(["checkout:main"])
  })

  test("dirty checkout requests stash confirmation without mutating", async () => {
    const { git, calls } = createGit()

    const result = await checkoutBranchWithOptionalStash({
      git,
      directory: "/repo",
      branch: "main",
      status: {
        current: "feature",
        tracking: null,
        ahead: 0,
        behind: 0,
        files: [{ path: "src/app.ts", index: " ", working_dir: "M" }],
        isClean: false,
      },
      restoreAfter: false,
    })

    expect(result).toEqual({ type: "needs-stash", branch: "main", dirtyFiles: 1 })
    expect(calls).toEqual([])
  })

  test("confirmed dirty checkout stashes, checks out, and restores", async () => {
    const { git, calls } = createGit()

    const result = await checkoutBranchWithOptionalStash({
      git,
      directory: "/repo",
      branch: "main",
      status: {
        current: "feature",
        tracking: null,
        ahead: 0,
        behind: 0,
        files: [{ path: "src/app.ts", index: " ", working_dir: "M" }],
        isClean: false,
      },
      stashConfirmed: true,
      restoreAfter: true,
    })

    expect(result).toEqual({ type: "checked-out", branch: "main", stashed: true, restored: true })
    expect(calls).toEqual(["stash", "checkout:main", "stashPop"])
  })

  test("attention states block checkout without stashing", async () => {
    const { git, calls } = createGit()

    const result = await checkoutBranchWithOptionalStash({
      git,
      directory: "/repo",
      branch: "main",
      attachment: {
        worktreeRoot: "/repo",
        cwd: "/repo",
        branch: "feature",
        headState: "branch",
        worktreeStatus: "ready",
        worktreeSource: "existing",
        legacy: false,
        degraded: false,
        attentionReason: "rebase",
      },
      status: { current: "feature", tracking: null, ahead: 0, behind: 0, files: [], isClean: true },
      stashConfirmed: true,
      restoreAfter: true,
    })

    expect(result).toEqual({ type: "blocked", branch: "main", reason: "rebase in progress" })
    expect(calls).toEqual([])
  })
})
