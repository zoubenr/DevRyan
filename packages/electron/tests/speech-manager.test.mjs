import { describe, expect, test } from 'bun:test';
import { MacosSpeechManager } from '../speech-manager.mjs';

const createManager = () => new MacosSpeechManager({
  baseDir: '/tmp/devryan-test',
  isPackaged: false,
  resourcesPath: null,
  emit: () => {},
  log: { warn: () => {} },
});

const createFakeChild = ({ markExitedOnKill = false } = {}) => {
  const writes = [];
  const ends = [];
  const kills = [];
  const fakeChild = {
    exitCode: null,
    signalCode: null,
    stdin: {
      writable: true,
      destroyed: false,
      write: (chunk) => {
        writes.push(String(chunk));
        return true;
      },
      end: () => {
        ends.push(true);
      },
    },
    kill: (signal) => {
      kills.push(signal);
      if (markExitedOnKill) {
        fakeChild.signalCode = signal;
      }
      return true;
    },
  };

  return {
    child: fakeChild,
    writes,
    ends,
    kills,
  };
};

describe('MacosSpeechManager', () => {
  test('stop sends a graceful stdin stop command before falling back to signals', () => {
    const manager = createManager();
    const fake = createFakeChild();
    manager.child = fake.child;

    const result = manager.stop();

    expect(result).toEqual({ stopped: true });
    expect(fake.writes).toEqual(['stop\n']);
    expect(fake.ends).toEqual([true]);
    expect(fake.kills).toEqual([]);
  });

  test('stop falls back to SIGTERM when the helper does not exit after graceful stop', async () => {
    const manager = createManager();
    const fake = createFakeChild({ markExitedOnKill: true });
    manager.child = fake.child;

    manager.stop();
    await Bun.sleep(850);

    expect(fake.writes).toEqual(['stop\n']);
    expect(fake.kills).toEqual(['SIGTERM']);
  });
});
