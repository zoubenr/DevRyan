# Daemon Ready Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make daemon startup ready handoff reliable by waiting long enough for slow startup, failing cleanly when handoff never completes, and terminating any daemon child that times out before metadata is written.

**Architecture:** Keep the source of truth as the server child IPC ready message from `server-startup-runtime.js`, because it carries the actual bound port for `--port 0`. Add a focused daemon startup helper in `packages/web/bin/cli.js` that waits for `{ type: 'openchamber:ready', port }`, distinguishes timeout/exit/error, and cleans up the detached process group before returning failure. Preserve foreground startup and existing CLI output mode semantics.

**Tech Stack:** Node/Bun ESM, `child_process.spawn`, IPC, Vitest, existing `packages/web/bin/cli.js` CLI runtime.

---

### Task 1: Add Testable Daemon Handoff Helpers

**Files:**
- Modify: `packages/web/bin/cli.js`
- Test: `packages/web/bin/cli.test.js`

- [ ] **Step 1: Export small helpers for daemon handoff**

In `packages/web/bin/cli.js`, add constants and helper exports near the existing process/runtime helpers:

```js
export const DEFAULT_DAEMON_READY_TIMEOUT_MS = 60000;

export function normalizeDaemonReadyTimeoutMs(value, fallback = DEFAULT_DAEMON_READY_TIMEOUT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

export function waitForDaemonReadyMessage(child, {
  requestedPort,
  timeoutMs = DEFAULT_DAEMON_READY_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(timeout);
      child.off?.('message', onMessage);
      child.off?.('exit', onExit);
      child.off?.('error', onError);
      resolve(result);
    };

    const onMessage = (msg) => {
      if (msg && msg.type === 'openchamber:ready' && typeof msg.port === 'number' && Number.isFinite(msg.port) && msg.port > 0) {
        finish({ ok: true, port: Math.trunc(msg.port) });
      }
    };

    const onExit = (code, signal) => {
      finish({ ok: false, reason: 'exit', requestedPort, code, signal });
    };

    const onError = (error) => {
      finish({ ok: false, reason: 'error', requestedPort, error });
    };

    const timeout = setTimeoutFn(() => {
      finish({ ok: false, reason: 'timeout', requestedPort, timeoutMs });
    }, timeoutMs);

    child.on?.('message', onMessage);
    child.on?.('exit', onExit);
    child.on?.('error', onError);
  });
}
```

- [ ] **Step 2: Add failing helper tests**

In `packages/web/bin/cli.test.js`, import `EventEmitter` and the new exports:

```js
import { EventEmitter } from 'events';
import {
  DEFAULT_DAEMON_READY_TIMEOUT_MS,
  normalizeDaemonReadyTimeoutMs,
  waitForDaemonReadyMessage,
} from './cli.js';
```

Add tests:

```js
describe('daemon ready handoff', () => {
  it('uses a 60s default ready timeout', () => {
    expect(DEFAULT_DAEMON_READY_TIMEOUT_MS).toBe(60000);
    expect(normalizeDaemonReadyTimeoutMs(undefined)).toBe(60000);
    expect(normalizeDaemonReadyTimeoutMs('45000')).toBe(45000);
    expect(normalizeDaemonReadyTimeoutMs('-1')).toBe(60000);
  });

  it('resolves with the IPC ready port', async () => {
    const child = new EventEmitter();
    const pending = waitForDaemonReadyMessage(child, {
      requestedPort: 0,
      timeoutMs: 60000,
      setTimeoutFn: () => 1,
      clearTimeoutFn: () => {},
    });
    child.emit('message', { type: 'openchamber:ready', port: 3219 });
    await expect(pending).resolves.toEqual({ ok: true, port: 3219 });
  });

  it('returns timeout when no ready message arrives', async () => {
    const child = new EventEmitter();
    let timeoutCallback;
    const pending = waitForDaemonReadyMessage(child, {
      requestedPort: 0,
      timeoutMs: 60000,
      setTimeoutFn: (callback) => {
        timeoutCallback = callback;
        return 1;
      },
      clearTimeoutFn: () => {},
    });
    timeoutCallback();
    await expect(pending).resolves.toEqual({
      ok: false,
      reason: 'timeout',
      requestedPort: 0,
      timeoutMs: 60000,
    });
  });

  it('returns exit when the daemon exits before ready', async () => {
    const child = new EventEmitter();
    const pending = waitForDaemonReadyMessage(child, {
      requestedPort: 3000,
      timeoutMs: 60000,
      setTimeoutFn: () => 1,
      clearTimeoutFn: () => {},
    });
    child.emit('exit', 1, null);
    await expect(pending).resolves.toEqual({
      ok: false,
      reason: 'exit',
      requestedPort: 3000,
      code: 1,
      signal: null,
    });
  });
});
```

- [ ] **Step 3: Run tests and confirm failures first**

Run:

```bash
bun run --cwd packages/web test -- cli.test.js
```

Expected before implementation is complete: tests fail because the helpers are missing or not wired exactly.

---

### Task 2: Clean Up Timed-Out Daemon Children

**Files:**
- Modify: `packages/web/bin/cli.js`
- Test: `packages/web/bin/cli.test.js`

- [ ] **Step 1: Add process-group termination helper**

In `packages/web/bin/cli.js`, add:

```js
export async function terminateDaemonChild(child, {
  waitTimeoutMs = 3000,
  waitForExit = waitForProcessExit,
} = {}) {
  if (!child || !Number.isFinite(child.pid) || child.pid <= 0) {
    return false;
  }

  try {
    if (process.platform === 'win32') {
      child.kill?.('SIGTERM');
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    try {
      child.kill?.('SIGTERM');
    } catch {
    }
  }

  const exited = await waitForExit(child.pid, waitTimeoutMs);
  if (exited) {
    return true;
  }

  try {
    if (process.platform === 'win32') {
      child.kill?.('SIGKILL');
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try {
      child.kill?.('SIGKILL');
    } catch {
    }
  }

  return await waitForExit(child.pid, waitTimeoutMs);
}
```

- [ ] **Step 2: Add tests with injected wait behavior**

In `packages/web/bin/cli.test.js`, import `terminateDaemonChild`, then add:

```js
it('asks timed-out daemon children to terminate', async () => {
  const signals = [];
  const child = {
    pid: 12345,
    kill(signal) {
      signals.push(signal);
      return true;
    },
  };

  const stopped = await terminateDaemonChild(child, {
    waitTimeoutMs: 1,
    waitForExit: async () => true,
  });

  expect(stopped).toBe(true);
  if (process.platform === 'win32') {
    expect(signals).toContain('SIGTERM');
  }
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun run --cwd packages/web test -- cli.test.js
```

Expected: daemon helper tests pass.

---

### Task 3: Wire Handoff Into `serve` Daemon Mode

**Files:**
- Modify: `packages/web/bin/cli.js`

- [ ] **Step 1: Replace the current 5s soft fallback**

In daemon mode, replace the existing `new Promise` block that resolves `targetPort` after `5000` with:

```js
const readyTimeoutMs = normalizeDaemonReadyTimeoutMs(process.env.OPENCHAMBER_DAEMON_READY_TIMEOUT_MS);
const readyResult = await waitForDaemonReadyMessage(child, {
  requestedPort: targetPort,
  timeoutMs: readyTimeoutMs,
});

if (!readyResult.ok) {
  try {
    if (typeof child.disconnect === 'function' && child.connected) {
      child.disconnect();
    }
  } catch {
  }

  const terminated = await terminateDaemonChild(child);
  try {
    fs.closeSync(logFd);
  } catch {
  }

  serveSpin?.error('Failed to start OpenChamber');
  const baseMessage = readyResult.reason === 'timeout'
    ? `Timed out waiting ${readyTimeoutMs}ms for daemon ready handoff.`
    : readyResult.reason === 'exit'
      ? `Daemon exited before ready handoff${readyResult.code === null ? '' : ` (exit code ${readyResult.code})`}.`
      : `Daemon failed before ready handoff${readyResult.error?.message ? `: ${readyResult.error.message}` : '.'}`;
  const cleanupMessage = terminated
    ? ' Startup child was terminated.'
    : ' Startup child could not be confirmed terminated; check logs and process list.';
  throw new Error(`${baseMessage}${cleanupMessage} Logs: ${initialLogPath}`);
}

const resolvedPort = readyResult.port;
```

- [ ] **Step 2: Keep metadata writes after successful handoff only**

Confirm these calls remain below the successful `resolvedPort` assignment:

```js
writePidFile(pidFilePath, child.pid, emitNotice);
writeInstanceOptions(instanceFilePath, {
  port: resolvedPort,
  host: effectiveHost,
  launchMode: 'daemon',
  uiPassword: effectiveUiPassword,
}, emitNotice);
```

This ensures no PID or instance file is written for a daemon that never completed handoff.

- [ ] **Step 3: Preserve JSON/quiet parity**

Do not add interactive prompts. The same failure must throw in human, `--json`, and `--quiet` modes. Existing top-level CLI error handling should shape the output for each mode.

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun run --cwd packages/web test -- cli.test.js
```

Expected: all CLI tests pass.

---

### Task 4: Manual Runtime Verification

**Files:**
- No source changes unless a bug is found.

- [ ] **Step 1: Verify normal daemon startup returns quickly**

Run:

```bash
OPENCHAMBER_DAEMON_READY_TIMEOUT_MS=60000 bun packages/web/bin/cli.js serve --port 0 --quiet
```

Expected: command prints the actual port quickly, not after 60 seconds.

- [ ] **Step 2: Verify metadata matches actual port**

Using the printed port, run:

```bash
bun packages/web/bin/cli.js status --port <printed-port> --json
```

Expected: JSON reports a running daemon on the same port.

- [ ] **Step 3: Stop the daemon**

Run:

```bash
bun packages/web/bin/cli.js stop --port <printed-port>
```

Expected: daemon stops and status no longer reports it as running.

- [ ] **Step 4: Verify timeout path with a tiny timeout**

Run:

```bash
OPENCHAMBER_DAEMON_READY_TIMEOUT_MS=1 bun packages/web/bin/cli.js serve --port 0 --quiet
```

Expected: non-zero exit, clear timeout error, no PID/instance file for guessed port, and no long-lived child process from that failed startup.

---

### Task 5: Repository Validation

**Files:**
- No source changes unless validation finds an issue.

- [ ] **Step 1: Run affected validation**

Run:

```bash
bun run validate:affected
```

Expected: pass.

- [ ] **Step 2: Run web/server tests if affected validation did not include them**

Run:

```bash
bun run --cwd packages/web test
```

Expected: pass.

---

## Notes

- The server child already sends the correct IPC message from `packages/web/server/lib/opencode/server-startup-runtime.js`; no server-side protocol change is needed.
- The timeout is a maximum wait, not a delay. Fast startup still returns as soon as IPC ready arrives.
- Keep `OPENCHAMBER_DAEMON_READY_TIMEOUT_MS` undocumented unless product wants a supported user-facing knob. It is useful for tests and diagnostics but should not become a broad configuration surface without need.
