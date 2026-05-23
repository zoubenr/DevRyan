import { describe, expect, test } from "bun:test"
import type { Event as OpencodeEvent, OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { coalescePartDeltaValue, createEventPipeline } from "./event-pipeline"

const originalWindow = globalThis.window
const originalWebSocket = globalThis.WebSocket
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator")

const failAfter = (ms: number) => new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error("Timed out waiting for event pipeline flush")), ms)
})

function partUpdatedEvent(text: string): OpencodeEvent {
  return {
    type: "message.part.updated",
    properties: {
      part: {
        id: "prt_1",
        messageID: "msg_1",
        sessionID: "ses_1",
        type: "text",
        text,
      },
    },
  } as OpencodeEvent
}

function deltaEvent(delta: string): OpencodeEvent {
  return {
    type: "message.part.delta",
    properties: {
      messageID: "msg_1",
      partID: "prt_1",
      field: "text",
      delta,
    },
  } as OpencodeEvent
}

function createSdk(events: OpencodeEvent[], streamFinished: () => void): OpencodeClient {
  return {
    global: {
      event: async ({ signal }: { signal: AbortSignal }) => ({
        stream: (async function* () {
          for (const payload of events) {
            yield { directory: "/repo", payload }
          }
          streamFinished()
          await new Promise<void>((resolve) => {
            if (signal.aborted) {
              resolve()
              return
            }
            signal.addEventListener("abort", () => resolve(), { once: true })
          })
        })(),
      }),
    },
  } as unknown as OpencodeClient
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event?: { code?: number }) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close() {
    this.readyState = 3
  }

  emitClose(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

function installBrowserStubs(options: { isVSCode?: boolean } = {}) {
  globalThis.window = {
    location: {
      href: "http://127.0.0.1:5173/",
      origin: "http://127.0.0.1:5173",
    },
    __OPENCHAMBER_RUNTIME_APIS__: options.isVSCode
      ? { runtime: { platform: "vscode", isDesktop: false, isVSCode: true, label: "VS Code" } }
      : undefined,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Window & typeof globalThis
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
}

function restoreBrowserStubs() {
  globalThis.window = originalWindow
  globalThis.WebSocket = originalWebSocket
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, "navigator")
  }
  FakeWebSocket.instances = []
}

function installRetryEventStubs(initialOnline = true) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  let online = initialOnline
  const getListeners = (type: string) => {
    let set = listeners.get(type)
    if (!set) {
      set = new Set()
      listeners.set(type, set)
    }
    return set
  }
  const windowStub = {
    location: {
      href: "http://127.0.0.1:5173/",
      origin: "http://127.0.0.1:5173",
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      getListeners(type).add(listener)
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) {
        if (typeof listener === "function") {
          listener.call(windowStub, event)
        } else {
          listener.handleEvent(event)
        }
      }
      return true
    },
  }
  globalThis.window = windowStub as unknown as Window & typeof globalThis
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    get: () => ({ onLine: online }),
  })
  return {
    setOnline(value: boolean) {
      online = value
    },
    dispatch(type: string) {
      windowStub.dispatchEvent(new globalThis.Event(type))
    },
  }
}

describe("coalescePartDeltaValue", () => {
  test("normalizes duplicate coalesced text frames", () => {
    const frame = "Continuing implementation: creating the hook and history section, then wiring them into the shell."

    expect(coalescePartDeltaValue("text", frame, `\n${frame}\n`)).toBe(`${frame}\n`)
  })

  test("normalizes duplicate coalesced output frames", () => {
    const frame = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string.'

    expect(coalescePartDeltaValue("output", frame, frame)).toBe(frame)
  })

  test("raw-appends non-text fields", () => {
    expect(coalescePartDeltaValue("other", "a", "a")).toBe("aa")
  })
})

describe("createEventPipeline", () => {
  test("preserves part update order around text deltas", async () => {
    let resolveStreamFinished!: () => void
    const streamFinished = new Promise<void>((resolve) => {
      resolveStreamFinished = resolve
    })
    let resolveDelivered!: () => void
    const deliveredAll = new Promise<void>((resolve) => {
      resolveDelivered = resolve
    })
    const delivered: OpencodeEvent[] = []
    const pipeline = createEventPipeline({
      sdk: createSdk([
        partUpdatedEvent("a"),
        deltaEvent("b"),
        partUpdatedEvent("ab"),
      ], resolveStreamFinished),
      onEvent: (_directory, payload) => {
        delivered.push(payload)
        if (delivered.length === 3) {
          resolveDelivered()
        }
      },
      transport: "sse",
      heartbeatTimeoutMs: 1_000,
    })

    try {
      await streamFinished
      await Promise.race([deliveredAll, failAfter(500)])
    } finally {
      pipeline.cleanup()
    }

    expect(delivered.map((event) => {
      if (event.type === "message.part.delta") {
        return `delta:${(event.properties as { delta: string }).delta}`
      }
      return `updated:${((event.properties as { part: { text: string } }).part).text}`
    })).toEqual(["updated:a", "delta:b", "updated:ab"])
  })

  test("falls back from an initial auto WebSocket close to SSE without disconnecting", async () => {
    installBrowserStubs()

    let releaseStream!: () => void
    const streamHold = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    let sseStarted!: () => void
    const sseAttempted = new Promise<void>((resolve) => {
      sseStarted = resolve
    })

    const disconnectReasons: string[] = []
    let transportSwitchCount = 0
    let reconnectCount = 0

    const sdk = {
      global: {
        event: async () => {
          sseStarted()
          return {
            stream: (async function* () {
              yield {
                directory: "/repo",
                payload: { type: "server.connected", properties: {} } as OpencodeEvent,
              }
              await streamHold
            })(),
          }
        },
      },
    } as unknown as OpencodeClient

    const pipeline = createEventPipeline({
      sdk,
      transport: "auto",
      reconnectDelayMs: 0,
      wsReadyTimeoutMs: 100,
      heartbeatTimeoutMs: 1_000,
      onEvent: () => {},
      onDisconnect: (reason) => {
        disconnectReasons.push(reason)
      },
      onTransportSwitch: () => {
        transportSwitchCount += 1
      },
      onReconnect: () => {
        reconnectCount += 1
      },
    })

    try {
      await Promise.resolve()
      FakeWebSocket.instances[0]?.emitClose()
      await Promise.race([sseAttempted, failAfter(500)])
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      pipeline.cleanup()
      releaseStream()
      restoreBrowserStubs()
    }

    expect(transportSwitchCount).toBe(1)
    expect(disconnectReasons).toEqual([])
    expect(reconnectCount).toBe(1)
  })

  test("uses SSE directly for VS Code runtime auto transport", async () => {
    installBrowserStubs({ isVSCode: true })

    let releaseStream!: () => void
    const streamHold = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    let sseStarted!: () => void
    const sseAttempted = new Promise<void>((resolve) => {
      sseStarted = resolve
    })
    let reconnectCount = 0

    const sdk = {
      global: {
        event: async () => {
          sseStarted()
          return {
            stream: (async function* () {
              yield {
                directory: "/repo",
                payload: { type: "server.connected", properties: {} } as OpencodeEvent,
              }
              await streamHold
            })(),
          }
        },
      },
    } as unknown as OpencodeClient

    const pipeline = createEventPipeline({
      sdk,
      transport: "auto",
      reconnectDelayMs: 0,
      wsReadyTimeoutMs: 100,
      heartbeatTimeoutMs: 1_000,
      onEvent: () => {},
      onReconnect: () => {
        reconnectCount += 1
      },
    })

    try {
      await Promise.race([sseAttempted, failAfter(500)])
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(FakeWebSocket.instances).toHaveLength(0)
    } finally {
      pipeline.cleanup()
      releaseStream()
      restoreBrowserStubs()
    }

    expect(reconnectCount).toBe(1)
  })

  test("interrupts retry delay when the browser comes back online", async () => {
    const retryEvents = installRetryEventStubs(false)
    const originalConsoleError = console.error
    console.error = () => {}

    let attempts = 0
    let resolveSecondAttempt!: () => void
    let releaseStream!: () => void
    const secondAttempt = new Promise<void>((resolve) => {
      resolveSecondAttempt = resolve
    })
    const streamHold = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    const sdk = {
      global: {
        event: async () => {
          attempts += 1
          if (attempts === 1) {
            throw new TypeError("Failed to fetch")
          }
          resolveSecondAttempt()
          return {
            stream: (async function* () {
              yield* []
              await streamHold
            })(),
          }
        },
      },
    } as unknown as OpencodeClient

    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      reconnectDelayMs: 500,
      heartbeatTimeoutMs: 1_000,
      onEvent: () => {},
    })

    try {
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(attempts).toBe(1)
      retryEvents.setOnline(true)
      retryEvents.dispatch("online")
      await Promise.race([secondAttempt, failAfter(150)])
    } finally {
      pipeline.cleanup()
      releaseStream?.()
      console.error = originalConsoleError
      restoreBrowserStubs()
    }

    expect(attempts).toBe(2)
  })

  test("paces permanent 4xx stream failures even with zero reconnect delay", async () => {
    installRetryEventStubs(true)
    const originalConsoleError = console.error
    console.error = () => {}
    let attempts = 0
    const sdk = {
      global: {
        event: async () => {
          attempts += 1
          throw Object.assign(new Error("not found"), { response: { status: 404 } })
        },
      },
    } as unknown as OpencodeClient

    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      reconnectDelayMs: 0,
      heartbeatTimeoutMs: 1_000,
      onEvent: () => {},
    })

    try {
      await new Promise((resolve) => setTimeout(resolve, 80))
    } finally {
      pipeline.cleanup()
      console.error = originalConsoleError
      restoreBrowserStubs()
    }

    expect(attempts).toBe(1)
  })
})
