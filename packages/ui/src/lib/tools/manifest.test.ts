import { describe, expect, test } from "bun:test"
import { buildToolManifest, getToolPermissionAliases } from "./manifest"

describe("tool permission manifest", () => {
  test("groups patch and fetch aliases used by harness diagnostics", () => {
    expect(getToolPermissionAliases("apply_patch")).toEqual(["edit", "write", "patch", "apply_patch"])
    expect(getToolPermissionAliases("webfetch")).toEqual(["webfetch"])

    const manifest = buildToolManifest({
      toolIds: ["apply_patch", "webfetch"],
      sourceRuntime: "web",
      directory: "/repo",
    })

    expect(manifest.aliases.apply_patch).toEqual(["edit", "write", "patch", "apply_patch"])
    expect(manifest.aliases.webfetch).toEqual(["webfetch"])
  })
})
