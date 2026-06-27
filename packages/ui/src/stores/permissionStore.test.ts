import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"

const respondCalls: Array<{ sessionID: string; requestID: string; reply: string }> = []
let listPendingPermissionsError: unknown = null
let sessions: Session[] = []
let permissionMap: Record<string, Array<{ id: string; sessionID?: string }>> = {}

mock.module("@/sync/sync-refs", () => ({
  getAllSyncSessions: () => sessions,
  getSyncChildStores: () => ({
    children: new Map([
      ["/repo", { getState: () => ({ permission: permissionMap }) }],
    ]),
  }),
}))

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    getDirectory: () => "/repo",
    listPendingPermissions: mock(async () => {
      if (listPendingPermissionsError) throw listPendingPermissionsError
      return []
    }),
  },
}))

mock.module("@/sync/session-actions", () => ({
  respondToPermission: mock(async (sessionID: string, requestID: string, reply: string) => {
    respondCalls.push({ sessionID, requestID, reply })
  }),
}))

mock.module("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      getDirectoryForSession: () => "/repo",
    }),
  },
}))

const { usePermissionStore } = await import("./permissionStore")

describe("permissionStore auto-accept", () => {
  beforeEach(() => {
    respondCalls.length = 0
    listPendingPermissionsError = null
    sessions = [{ id: "session-a", title: "Session", time: { created: 1, updated: 1 } } as Session]
    permissionMap = { "session-a": [{ id: "perm-1", sessionID: "session-a" }] }
    usePermissionStore.setState({ autoAccept: {} })
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch
  })

  test("still responds to sync-store pending permissions when the pending API fails", async () => {
    listPendingPermissionsError = new Error("pending list unavailable")

    await usePermissionStore.getState().setSessionAutoAccept("session-a", true)

    expect(respondCalls).toEqual([
      { sessionID: "session-a", requestID: "perm-1", reply: "once" },
    ])
  })
})
