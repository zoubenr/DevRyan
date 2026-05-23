import { describe, expect, test } from "bun:test"
import { getDiffPatchEntries, splitUnifiedDiffPatch } from "./toolPartDiffEntries"

const multiFilePatch = [
  "--- old/a.txt",
  "+++ new/a.txt",
  "@@ -1 +1 @@",
  "-old a",
  "+new a",
  "--- old/b.txt",
  "+++ new/b.txt",
  "@@ -1 +1 @@",
  "-old b",
  "+new b",
].join("\n")

describe("ToolPart diff entries", () => {
  test("splits arbitrary non-empty unified file headers into separate files", () => {
    const entries = splitUnifiedDiffPatch(multiFilePatch)

    expect(entries.map((entry) => entry.title)).toEqual(["new/a.txt", "new/b.txt"])
    expect(entries).toHaveLength(2)
  })

  test("flattens metadata file entries that contain multiple unified diffs", () => {
    const entries = getDiffPatchEntries(
      {
        files: [
          {
            relativePath: "combined.patch",
            patch: multiFilePatch,
          },
        ],
      },
      "",
      "/repo",
    )

    expect(entries.map((entry) => entry.title)).toEqual(["new/a.txt", "new/b.txt"])
    expect(entries.map((entry) => entry.patch)).toEqual([
      [
        "--- old/a.txt",
        "+++ new/a.txt",
        "@@ -1 +1 @@",
        "-old a",
        "+new a",
      ].join("\n"),
      [
        "--- old/b.txt",
        "+++ new/b.txt",
        "@@ -1 +1 @@",
        "-old b",
        "+new b",
      ].join("\n"),
    ])
  })
})
