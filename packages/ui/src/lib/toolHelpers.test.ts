import { describe, expect, test } from "bun:test";
import { getToolMetadata } from "./toolHelpers";

describe("getToolMetadata", () => {
  test("labels skill tool activity as loading a skill", () => {
    expect(getToolMetadata("skill").displayName).toBe("Loading Skill:");
  });

  test("labels task tool activity as a subagent task", () => {
    expect(getToolMetadata("task").displayName).toBe("Subagent Task:");
  });

  test("formats unknown MCP tool names with title-cased words", () => {
    expect(getToolMetadata("Linear_get_issue").displayName).toBe("Linear Get Issue");
    expect(getToolMetadata("linear_save_issue").displayName).toBe("Linear Save Issue");
  });
});
