import { describe, expect, test } from "bun:test";

import { isOrphanNarrationFragment } from "./orphanNarration";

describe("isOrphanNarrationFragment", () => {
  test("suppresses a lowercase tail wedged between tool parts", () => {
    expect(
      isOrphanNarrationFragment(" existing HTML for conventions to reuse.\n", "tool", "tool"),
    ).toBe(true);
  });

  test("suppresses a fragment between reasoning and tool", () => {
    expect(isOrphanNarrationFragment("and update the head.", "reasoning", "tool")).toBe(true);
  });

  test("keeps text that starts with a capital (a real sentence)", () => {
    expect(
      isOrphanNarrationFragment("The workspace already has a full site.", "tool", "tool"),
    ).toBe(false);
  });

  test("keeps the leading intro (no non-text part before it)", () => {
    expect(isOrphanNarrationFragment("checking the workspace.", undefined, "tool")).toBe(false);
    expect(isOrphanNarrationFragment("checking the workspace.", "text", "tool")).toBe(false);
  });

  test("keeps the final answer (no non-text part after it)", () => {
    expect(isOrphanNarrationFragment("done with the change.", "tool", undefined)).toBe(false);
    expect(isOrphanNarrationFragment("done with the change.", "tool", "text")).toBe(false);
  });

  test("keeps plan text (sentinel / heading start)", () => {
    expect(isOrphanNarrationFragment("<!--plan-->\n# Plan", "tool", "tool")).toBe(false);
    expect(isOrphanNarrationFragment("# Create demo.html", "tool", "tool")).toBe(false);
  });

  test("keeps long lowercase narration (not a tiny tail)", () => {
    const long = "x".repeat(201);
    expect(isOrphanNarrationFragment(long, "tool", "tool")).toBe(false);
  });

  test("ignores empty/whitespace", () => {
    expect(isOrphanNarrationFragment("   \n ", "tool", "tool")).toBe(false);
  });
});
