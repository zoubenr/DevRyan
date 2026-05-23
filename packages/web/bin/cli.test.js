import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { pathToFileURL } from 'url';

import { isModuleCliExecution, normalizeCliEntryPath } from './cli-entry.js';
import {
  DEFAULT_DAEMON_READY_TIMEOUT_MS,
  normalizeDaemonReadyTimeoutMs,
  parseArgs,
  terminateDaemonChild,
  waitForDaemonReadyMessage,
} from './cli.js';

describe('cli args', () => {
  it('accepts legacy daemon flags as no-ops', () => {
    expect(parseArgs(['serve', '--daemon']).removedFlagErrors).toEqual([]);
    expect(parseArgs(['serve', '-d']).removedFlagErrors).toEqual([]);
  });
});

describe('cli entry detection', () => {
  const modulePath = '/tmp/openchamber/bin/cli.js';
  const moduleUrl = pathToFileURL(modulePath).href;

  it('resolves symlinked entry paths before comparing', () => {
    const symlinkPath = '/usr/local/bin/openchamber';
    const realpath = (filePath) => {
      if (filePath === path.resolve(symlinkPath)) {
        return modulePath;
      }
      return filePath;
    };

    expect(isModuleCliExecution(symlinkPath, moduleUrl, realpath)).toBe(true);
  });

  it('falls back to resolved paths when realpath fails', () => {
    const realpath = () => {
      throw new Error('realpath unavailable');
    };

    expect(isModuleCliExecution(modulePath, moduleUrl, realpath)).toBe(true);
  });

  it('returns false for non-matching entry path', () => {
    expect(isModuleCliExecution('/tmp/other-cli.js', moduleUrl)).toBe(false);
  });

  it('returns false for empty entry path', () => {
    expect(isModuleCliExecution('', moduleUrl)).toBe(false);
  });

  it('returns false when module url is not provided', () => {
    expect(isModuleCliExecution(modulePath)).toBe(false);
  });

  it('accepts wrapper binary name fallback when requested', () => {
    const wrapperPath = '/home/user/.local/bin/openchamber';
    expect(isModuleCliExecution(wrapperPath, moduleUrl, undefined, 'openchamber')).toBe(true);
  });

  it('normalizes direct paths when realpath fails', () => {
    const unresolvedPath = './packages/web/bin/cli.js';
    const realpath = () => {
      throw new Error('no symlink resolution');
    };

    expect(normalizeCliEntryPath(unresolvedPath, realpath)).toBe(path.resolve(unresolvedPath));
  });
});

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

  it('asks timed-out daemon children to terminate', async () => {
    const signals = [];
    const child = {
      pid: 12345,
      kill(signal) {
        signals.push(['child', signal]);
        return true;
      },
    };

    const stopped = await terminateDaemonChild(child, {
      waitTimeoutMs: 1,
      waitForExit: async () => true,
      processKill: (pid, signal) => {
        signals.push([pid, signal]);
      },
      platform: 'darwin',
    });

    expect(stopped).toBe(true);
    expect(signals).toEqual([[-12345, 'SIGTERM']]);
  });
});
