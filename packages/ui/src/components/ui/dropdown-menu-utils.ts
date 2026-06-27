import React from "react";

export const resolveDropdownTriggerNativeButton = (
  explicitNativeButton: boolean | undefined,
  asChild: boolean | undefined,
  children: React.ReactNode,
) => {
  if (explicitNativeButton !== undefined) {
    return explicitNativeButton;
  }
  if (!asChild || !React.isValidElement(children)) {
    return undefined;
  }
  return typeof children.type === "string" && children.type !== "button" ? false : undefined;
};
