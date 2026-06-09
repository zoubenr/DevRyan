import { describe, expect, test } from "bun:test";

import { toggleMcpServerEnabled } from "./McpDropdown.actions";

describe("toggleMcpServerEnabled", () => {
  test("persists enablement before connecting an MCP server", async () => {
    const calls: string[] = [];

    await toggleMcpServerEnabled({
      name: "linear",
      enabled: true,
      directory: "/repo/project",
      isConnected: false,
      updateMcp: async (name, config, options) => {
        calls.push(`update:${name}:${String(config.enabled)}:${options?.directory ?? ""}`);
        return { ok: true };
      },
      loadMcpConfigs: async (options) => {
        calls.push(`load:${options?.directory ?? ""}:${String(options?.force)}`);
        return true;
      },
      refresh: async (options) => {
        calls.push(`refresh:${options?.directory ?? ""}:${String(options?.silent)}`);
      },
      connect: async (name, directory) => {
        calls.push(`connect:${name}:${directory ?? ""}`);
      },
      disconnect: async (name, directory) => {
        calls.push(`disconnect:${name}:${directory ?? ""}`);
      },
    });

    expect(calls).toEqual([
      "update:linear:true:/repo/project",
      "load:/repo/project:true",
      "refresh:/repo/project:true",
      "connect:linear:/repo/project",
      "refresh:/repo/project:true",
    ]);
  });

  test("persists disablement and disconnects only when currently connected", async () => {
    const calls: string[] = [];

    await toggleMcpServerEnabled({
      name: "linear",
      enabled: false,
      directory: "/repo/project",
      isConnected: true,
      updateMcp: async (name, config, options) => {
        calls.push(`update:${name}:${String(config.enabled)}:${options?.directory ?? ""}`);
        return { ok: true };
      },
      loadMcpConfigs: async (options) => {
        calls.push(`load:${options?.directory ?? ""}:${String(options?.force)}`);
        return true;
      },
      refresh: async (options) => {
        calls.push(`refresh:${options?.directory ?? ""}:${String(options?.silent)}`);
      },
      connect: async (name, directory) => {
        calls.push(`connect:${name}:${directory ?? ""}`);
      },
      disconnect: async (name, directory) => {
        calls.push(`disconnect:${name}:${directory ?? ""}`);
      },
    });

    expect(calls).toEqual([
      "update:linear:false:/repo/project",
      "disconnect:linear:/repo/project",
      "load:/repo/project:true",
      "refresh:/repo/project:true",
    ]);
  });
});
