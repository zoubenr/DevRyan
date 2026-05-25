import { describe, expect, test } from "bun:test"

import {
  selectProjectsNeedingRootBranchRefresh,
  type ProjectRootBranchRefreshSignature,
} from "./useProjectRepoStatus"

describe("selectProjectsNeedingRootBranchRefresh", () => {
  test("selects only projects whose path or known branch changed", () => {
    const previous = new Map<string, ProjectRootBranchRefreshSignature>([
      ["project-a", { path: "/repo/a", knownBranch: "main" }],
      ["project-b", { path: "/repo/b", knownBranch: "dev" }],
    ])

    const result = selectProjectsNeedingRootBranchRefresh({
      normalizedProjects: [
        { id: "project-a", path: "/repo/a", normalizedPath: "/repo/a" },
        { id: "project-b", path: "/repo/b-renamed", normalizedPath: "/repo/b-renamed" },
        { id: "project-c", path: "/repo/c", normalizedPath: "/repo/c" },
      ],
      gitRepoStatus: new Map([
        ["/repo/a", { isGitRepo: true, branch: "main" }],
        ["/repo/b-renamed", { isGitRepo: true, branch: "feature" }],
      ]),
      previous,
    })

    expect(result.changedProjects.map((project) => project.id)).toEqual(["project-b", "project-c"])
    expect(result.next.get("project-a")).toEqual({ path: "/repo/a", knownBranch: "main" })
    expect(result.next.get("project-b")).toEqual({ path: "/repo/b-renamed", knownBranch: "feature" })
    expect(result.next.get("project-c")).toEqual({ path: "/repo/c", knownBranch: null })
  })
})
