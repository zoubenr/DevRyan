import { describe, expect, test } from "bun:test"

import {
  buildDraftLocalBranchOptions,
  decodeDraftBranchOptionValue,
  encodeDraftBranchOptionValue,
} from "./chatInputBranchOptions"

describe("chat input branch options", () => {
  test("builds local branch options including main", () => {
    const options = buildDraftLocalBranchOptions({
      allBranches: ["feature", "main", "remotes/origin/main"],
      currentBranch: "feature",
    })

    expect(options).toEqual([{ value: "branch:main", label: "main" }])
  })

  test("does not duplicate the current root branch as a selectable local branch", () => {
    const options = buildDraftLocalBranchOptions({
      allBranches: ["feature", "main"],
      currentBranch: "main",
    })

    expect(options).toEqual([{ value: "branch:feature", label: "feature" }])
  })

  test("decodes branch option values separately from directory values", () => {
    expect(encodeDraftBranchOptionValue("main")).toBe("branch:main")
    expect(decodeDraftBranchOptionValue("branch:main")).toBe("main")
    expect(decodeDraftBranchOptionValue("/repo")).toBeNull()
  })
})
