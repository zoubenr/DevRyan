import { beforeEach, describe, expect, mock, test } from "bun:test"

type ExecResult = {
  command: string
  success: boolean
  stdout?: string
  stderr?: string
}

type GitStatus = {
  current?: string
  isClean: boolean
  ahead: number
  behind: number
  tracking: string | null
}

const execCalls: Array<{ command: string; cwd: string }> = []
const gitStatusCalls: string[] = []

let execHandler: (command: string, cwd: string) => Promise<ExecResult>
let gitStatusHandler: (directory: string) => Promise<GitStatus>

mock.module("@/lib/execCommands", () => ({
  execCommand: mock((command: string, cwd: string) => {
    execCalls.push({ command, cwd })
    return execHandler(command, cwd)
  }),
}))

mock.module("@/lib/gitApi", () => ({
  getGitStatus: mock((directory: string) => {
    gitStatusCalls.push(directory)
    return gitStatusHandler(directory)
  }),
}))

const combinedRevParse = (gitDir: string, commonDir: string): ExecResult => ({
  command: "git rev-parse --absolute-git-dir --git-common-dir",
  success: true,
  stdout: `${gitDir}\n${commonDir}\n`,
})

const status = (branch: string): GitStatus => ({
  current: branch,
  isClean: true,
  ahead: 0,
  behind: 0,
  tracking: null,
})

describe("getRootBranch", () => {
  beforeEach(() => {
    execCalls.length = 0
    gitStatusCalls.length = 0
    execHandler = async (command, cwd) => {
      if (command === "git rev-parse --absolute-git-dir --git-common-dir") {
        return combinedRevParse(`${cwd}/.git`, `${cwd}/.git`)
      }
      return { command, success: false, stderr: "unexpected command" }
    }
    gitStatusHandler = async () => status("main")
  })

  test("dedupes simultaneous primary root resolution", async () => {
    const api = await import("./worktreeStatus")
    api.invalidateRootBranchCache()
    execHandler = () => new Promise((resolve) => {
      setTimeout(() => resolve(combinedRevParse("/repo/.git", "/repo/.git")), 10)
    })

    await Promise.all([
      api.getRootBranch("/repo"),
      api.getRootBranch("/repo"),
    ])

    expect(execCalls.filter((call) => call.command === "git rev-parse --absolute-git-dir --git-common-dir")).toHaveLength(1)
    expect(gitStatusCalls).toEqual(["/repo"])
  })

  test("uses cached root branch reads for repeated queries", async () => {
    const api = await import("./worktreeStatus")
    api.invalidateRootBranchCache()

    expect(await api.getRootBranch("/repo")).toBe("main")
    expect(await api.getRootBranch("/repo")).toBe("main")

    expect(execCalls).toHaveLength(1)
    expect(gitStatusCalls).toEqual(["/repo"])
  })

  test("cache invalidation forces a new root and branch read", async () => {
    const api = await import("./worktreeStatus")
    api.invalidateRootBranchCache()

    await api.getRootBranch("/repo")
    api.invalidateRootBranchCache?.("/repo")
    await api.getRootBranch("/repo")

    expect(execCalls).toHaveLength(2)
    expect(gitStatusCalls).toEqual(["/repo", "/repo"])
  })

  test("uses a known branch only when the queried directory is the primary root", async () => {
    const api = await import("./worktreeStatus")
    api.invalidateRootBranchCache()
    gitStatusHandler = async () => status("from-status")

    expect(await api.getRootBranch("/repo", { knownBranch: "from-store" })).toBe("from-store")
    expect(gitStatusCalls).toEqual([])
  })

  test("ignores a known branch for linked worktree queries and reads the primary root branch", async () => {
    const api = await import("./worktreeStatus")
    api.invalidateRootBranchCache()
    execHandler = async (command) => {
      if (command === "git rev-parse --absolute-git-dir --git-common-dir") {
        return combinedRevParse("/repo/.git/worktrees/feature", "/repo/.git")
      }
      return { command, success: false }
    }
    gitStatusHandler = async () => status("main")

    expect(await api.getRootBranch("/repo-wt/feature", { knownBranch: "feature" })).toBe("main")
    expect(gitStatusCalls).toEqual(["/repo"])
  })
})
