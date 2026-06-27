import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isManagedOpenCodeProcessCommand,
  readManagedOpenCodeRegistry,
  reapOrphanedManagedOpenCodeProcesses,
  registerManagedOpenCodeProcess,
  unregisterManagedOpenCodeProcess,
} from './managed-process-registry.js';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

const createRegistryPath = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'devryan-managed-opencode-'));
  tempDirs.push(dir);
  return path.join(dir, 'registry.json');
};

describe('managed OpenCode process registry', () => {
  it('registers and unregisters a managed child process record', () => {
    const registryPath = createRegistryPath();

    registerManagedOpenCodeProcess({
      childPid: 200,
      ownerPid: 100,
      port: 45678,
      binary: 'opencode',
      hostRuntime: 'web',
      startedAt: 1234,
    }, { registryPath });

    expect(readManagedOpenCodeRegistry({ registryPath })).toEqual([
      expect.objectContaining({
        childPid: 200,
        ownerPid: 100,
        port: 45678,
        binary: 'opencode',
        hostRuntime: 'web',
      }),
    ]);

    expect(unregisterManagedOpenCodeProcess(200, { registryPath })).toBe(true);
    expect(readManagedOpenCodeRegistry({ registryPath })).toEqual([]);
  });

  it('keeps a record when the owner process is still alive', async () => {
    const registryPath = createRegistryPath();
    registerManagedOpenCodeProcess({
      childPid: 200,
      ownerPid: 100,
      port: 45678,
      binary: 'opencode',
      hostRuntime: 'web',
    }, { registryPath });

    const terminate = vi.fn();
    const result = await reapOrphanedManagedOpenCodeProcesses({
      registryPath,
      isProcessRunning: (pid) => pid === 100 || pid === 200,
      readProcessCommand: () => 'opencode serve --hostname 127.0.0.1 --port 45678',
      terminateManagedOpenCodePid: terminate,
    });

    expect(result.skipped).toEqual([expect.objectContaining({ reason: 'owner-alive' })]);
    expect(result.reaped).toEqual([]);
    expect(terminate).not.toHaveBeenCalled();
    expect(readManagedOpenCodeRegistry({ registryPath })).toHaveLength(1);
  });

  it('reaps an orphaned managed child whose command matches the registry', async () => {
    const registryPath = createRegistryPath();
    registerManagedOpenCodeProcess({
      childPid: 200,
      ownerPid: 100,
      port: 45678,
      binary: 'opencode',
      hostRuntime: 'web',
    }, { registryPath });

    const terminate = vi.fn(async () => true);
    const result = await reapOrphanedManagedOpenCodeProcesses({
      registryPath,
      isProcessRunning: (pid) => pid === 200,
      readProcessCommand: () => 'opencode serve --hostname 127.0.0.1 --port 45678',
      terminateManagedOpenCodePid: terminate,
    });

    expect(result.reaped).toEqual([expect.objectContaining({ childPid: 200, terminated: true })]);
    expect(terminate).toHaveBeenCalledWith(200, expect.objectContaining({ port: 45678 }));
    expect(readManagedOpenCodeRegistry({ registryPath })).toEqual([]);
  });

  it('drops dead-child records without trying to kill anything', async () => {
    const registryPath = createRegistryPath();
    registerManagedOpenCodeProcess({
      childPid: 200,
      ownerPid: 100,
      port: 45678,
      binary: 'opencode',
      hostRuntime: 'web',
    }, { registryPath });

    const terminate = vi.fn();
    const result = await reapOrphanedManagedOpenCodeProcesses({
      registryPath,
      isProcessRunning: () => false,
      readProcessCommand: () => 'opencode serve --hostname 127.0.0.1 --port 45678',
      terminateManagedOpenCodePid: terminate,
    });

    expect(result.removed).toEqual([expect.objectContaining({ reason: 'child-not-running' })]);
    expect(terminate).not.toHaveBeenCalled();
    expect(readManagedOpenCodeRegistry({ registryPath })).toEqual([]);
  });

  it('does not reap a reused PID whose command is no longer OpenCode', async () => {
    const registryPath = createRegistryPath();
    registerManagedOpenCodeProcess({
      childPid: 200,
      ownerPid: 100,
      port: 45678,
      binary: 'opencode',
      hostRuntime: 'web',
    }, { registryPath });

    const terminate = vi.fn();
    const result = await reapOrphanedManagedOpenCodeProcesses({
      registryPath,
      isProcessRunning: (pid) => pid === 200,
      readProcessCommand: () => '/usr/bin/python3 /tmp/server.py',
      terminateManagedOpenCodePid: terminate,
    });

    expect(result.removed).toEqual([expect.objectContaining({ reason: 'command-mismatch' })]);
    expect(result.reaped).toEqual([]);
    expect(terminate).not.toHaveBeenCalled();
    expect(readManagedOpenCodeRegistry({ registryPath })).toEqual([]);
  });

  it('requires the registered port when matching OpenCode commands', () => {
    expect(isManagedOpenCodeProcessCommand(
      'opencode serve --hostname 127.0.0.1 --port 45678',
      { binary: 'opencode', port: 45678 },
    )).toBe(true);
    expect(isManagedOpenCodeProcessCommand(
      'opencode serve --hostname 127.0.0.1 --port 4096',
      { binary: 'opencode', port: 45678 },
    )).toBe(false);
  });
});
