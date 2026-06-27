import React from "react";
import { describe, expect, test } from "bun:test";

import { resolveDropdownTriggerNativeButton } from "./dropdown-menu-utils";

describe("resolveDropdownTriggerNativeButton", () => {
  test("keeps the Base UI default when rendering children directly", () => {
    expect(resolveDropdownTriggerNativeButton(undefined, false, "Open")).toBe(undefined);
  });

  test("keeps native button semantics for button as-child triggers", () => {
    expect(resolveDropdownTriggerNativeButton(undefined, true, <button type="button">Open</button>)).toBe(undefined);
  });

  test("uses non-native semantics for known non-button as-child trigger elements", () => {
    expect(resolveDropdownTriggerNativeButton(undefined, true, <div>Open</div>)).toBe(false);
    expect(resolveDropdownTriggerNativeButton(undefined, true, <span>Open</span>)).toBe(false);
  });

  test("respects explicit nativeButton overrides", () => {
    expect(resolveDropdownTriggerNativeButton(true, true, <div>Open</div>)).toBe(true);
    expect(resolveDropdownTriggerNativeButton(false, true, <button type="button">Open</button>)).toBe(false);
  });
});
