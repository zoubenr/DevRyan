import { beforeEach, describe, expect, test } from "bun:test";
import { useMcpConfigStore } from "./useMcpConfigStore";

const originalFetch = globalThis.fetch;

const mcpResponse = (name: string) => Response.json([
  {
    name,
    scope: "project",
    type: "local",
    command: ["echo", name],
    enabled: true,
  },
]);

describe("useMcpConfigStore", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    useMcpConfigStore.setState({
      mcpServers: [],
      selectedMcpName: null,
      isLoading: false,
      mcpDraft: null,
    });
  });

  test("loads MCP configs for the explicit directory instead of reusing the previous project", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push(`${init?.method || "GET"} ${String(input)}`);
      if (String(input).startsWith("/api/config/mcp/recover")) {
        return Response.json({ migrated: [], skipped: [], requiresReload: false });
      }
      return String(input).includes(encodeURIComponent("/repo/two"))
        ? mcpResponse("two-server")
        : mcpResponse("one-server");
    }) as typeof fetch;

    await useMcpConfigStore.getState().loadMcpConfigs({ force: true, directory: "/repo/one" });
    expect(useMcpConfigStore.getState().mcpServers.map((server) => server.name)).toEqual(["one-server"]);

    await useMcpConfigStore.getState().loadMcpConfigs({ force: true, directory: "/repo/two" });
    expect(useMcpConfigStore.getState().mcpServers.map((server) => server.name)).toEqual(["two-server"]);
    expect(calls).toEqual([
      `POST /api/config/mcp/recover?directory=${encodeURIComponent("/repo/one")}`,
      `GET /api/config/mcp?directory=${encodeURIComponent("/repo/one")}`,
      `POST /api/config/mcp/recover?directory=${encodeURIComponent("/repo/two")}`,
      `GET /api/config/mcp?directory=${encodeURIComponent("/repo/two")}`,
    ]);
  });

  test("clears the selected MCP when the loaded directory no longer contains it", async () => {
    useMcpConfigStore.setState({ selectedMcpName: "old-server" });
    globalThis.fetch = (async (input) => {
      if (String(input).startsWith("/api/config/mcp/recover")) {
        return Response.json({ migrated: [], skipped: [], requiresReload: false });
      }
      return mcpResponse("new-server");
    }) as typeof fetch;

    await useMcpConfigStore.getState().loadMcpConfigs({ force: true, directory: "/repo/selection" });

    expect(useMcpConfigStore.getState().selectedMcpName).toBeNull();
  });

  test("runs safe MCP recovery before the first forced config load for a directory", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push(`${init?.method || "GET"} ${String(input)}`);
      if (String(input).startsWith("/api/config/mcp/recover")) {
        return Response.json({
          migrated: [{ name: "legacy-server", scope: "project", targetPath: "/repo/recovery/opencode.json" }],
          skipped: [],
          requiresReload: true,
        });
      }
      return mcpResponse("legacy-server");
    }) as typeof fetch;

    await useMcpConfigStore.getState().loadMcpConfigs({ force: true, directory: "/repo/recovery" });
    await useMcpConfigStore.getState().loadMcpConfigs({ force: true, directory: "/repo/recovery" });

    expect(calls).toEqual([
      `POST /api/config/mcp/recover?directory=${encodeURIComponent("/repo/recovery")}`,
      `GET /api/config/mcp?directory=${encodeURIComponent("/repo/recovery")}`,
      `GET /api/config/mcp?directory=${encodeURIComponent("/repo/recovery")}`,
    ]);
  });

  test("updates MCP configs for the explicit directory", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push(`${init?.method || "GET"} ${String(input)} ${String(init?.headers ? JSON.stringify(init.headers) : "")} ${String(init?.body ?? "")}`);
      return Response.json({ success: true, requiresReload: false });
    }) as typeof fetch;

    await useMcpConfigStore.getState().updateMcp(
      "linear",
      { enabled: true },
      { directory: "/repo/project" },
    );

    expect(calls).toEqual([
      `PATCH /api/config/mcp/linear?directory=${encodeURIComponent("/repo/project")} {"Content-Type":"application/json","x-opencode-directory":"/repo/project"} {"enabled":true}`,
      `POST /api/config/mcp/recover?directory=${encodeURIComponent("/repo/project")} {"x-opencode-directory":"/repo/project"} `,
      `GET /api/config/mcp?directory=${encodeURIComponent("/repo/project")} {"x-opencode-directory":"/repo/project"} `,
    ]);
  });
});
