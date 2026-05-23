import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, "tooltip.tsx"), "utf8");

describe("Tooltip safety boundary", () => {
  test("wraps tooltip trigger and content parts in a local error boundary", () => {
    const code = source();

    expect(code).toContain("class TooltipPartBoundary");
    expect(code).toContain("<TooltipPartBoundary fallback={children}>");
    expect(code).toContain("<TooltipPartBoundary>");
  });
});
