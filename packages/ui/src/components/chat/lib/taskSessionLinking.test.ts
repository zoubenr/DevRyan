import { describe, expect, test } from 'bun:test';
import type { Part, Session } from '@opencode-ai/sdk/v2';
import {
  buildTaskInvocationSignature,
  createTaskInvocationFromToolPart,
  resolveTaskSessionAssignments,
  type TaskSessionInvocation,
} from './taskSessionLinking';

const parentSessionId = 'parent-session';

const task = (
  key: string,
  order: number,
  overrides: Partial<TaskSessionInvocation> = {},
): TaskSessionInvocation => ({
  key,
  parentSessionId,
  order,
  subagentType: 'explorer',
  ...overrides,
});

const child = (id: string, created: number, agent = 'explorer'): Session => ({
  id,
  slug: id,
  projectID: 'project',
  directory: '/repo',
  title: id,
  time: { created, updated: created },
  parentID: parentSessionId,
  agent,
} as Session);

describe('resolveTaskSessionAssignments', () => {
  test('does not assign one partial child to multiple same-agent task rows', () => {
    const assignments = resolveTaskSessionAssignments({
      parentSessionId,
      tasks: [
        task('task-1', 0),
        task('task-2', 1),
        task('task-3', 2),
      ],
      childSessions: [child('child-1', 100)],
    });

    expect(assignments.get('task-1')?.sessionId).toBe(undefined);
    expect(assignments.get('task-2')?.sessionId).toBe(undefined);
    expect(assignments.get('task-3')?.sessionId).toBe(undefined);
  });

  test('assigns same-agent tasks one-to-one by stable chronological order when enough children exist', () => {
    const assignments = resolveTaskSessionAssignments({
      parentSessionId,
      tasks: [
        task('task-1', 0, { taskStartTime: 100 }),
        task('task-2', 1, { taskStartTime: 200 }),
        task('task-3', 2, { taskStartTime: 300 }),
      ],
      childSessions: [
        child('child-2', 220),
        child('child-3', 330),
        child('child-1', 110),
      ],
    });

    expect(assignments.get('task-1')?.sessionId).toBe('child-1');
    expect(assignments.get('task-2')?.sessionId).toBe('child-2');
    expect(assignments.get('task-3')?.sessionId).toBe('child-3');
  });

  test('explicit task metadata wins and reserves that child from inferred rows', () => {
    const assignments = resolveTaskSessionAssignments({
      parentSessionId,
      tasks: [
        task('task-explicit', 0, { explicitSessionId: 'child-2' }),
        task('task-inferred', 1),
      ],
      childSessions: [
        child('child-1', 100),
        child('child-2', 200),
      ],
    });

    expect(assignments.get('task-explicit')?.sessionId).toBe('child-2');
    expect(assignments.get('task-inferred')?.sessionId).toBe('child-1');
  });

  test('matches mixed requested agents before using chronological assignment', () => {
    const assignments = resolveTaskSessionAssignments({
      parentSessionId,
      tasks: [
        task('task-general', 0, { subagentType: 'general-purpose' }),
        task('task-explorer', 1, { subagentType: 'explorer' }),
      ],
      childSessions: [
        child('child-explorer', 100, 'explorer'),
        child('child-general', 90, 'general-purpose'),
      ],
    });

    expect(assignments.get('task-general')?.sessionId).toBe('child-general');
    expect(assignments.get('task-explorer')?.sessionId).toBe('child-explorer');
  });

  test('leaves a single task unresolved when multiple same-agent children are indistinguishable', () => {
    const assignments = resolveTaskSessionAssignments({
      parentSessionId,
      tasks: [task('task-1', 0)],
      childSessions: [
        child('child-1', 100),
        child('child-2', 200),
      ],
    });

    expect(assignments.get('task-1')?.sessionId).toBe(undefined);
  });
});

describe('buildTaskInvocationSignature', () => {
  test('changes when a new task invocation appears', () => {
    const first = buildTaskInvocationSignature([task('task-1', 0)]);
    const second = buildTaskInvocationSignature([task('task-1', 0), task('task-2', 1)]);

    expect(second).not.toBe(first);
  });

  test('changes when an existing task invocation receives lifecycle timing', () => {
    const started = buildTaskInvocationSignature([task('task-1', 0, { taskStartTime: 100 })]);
    const completed = buildTaskInvocationSignature([task('task-1', 0, { taskStartTime: 100, taskEndTime: 250 })]);

    expect(completed).not.toBe(started);
  });
});

describe('createTaskInvocationFromToolPart', () => {
  test('does not infer-link a task tool that failed before a child session was created', () => {
    const invocation = createTaskInvocationFromToolPart({
      id: 'part-denied',
      sessionID: parentSessionId,
      messageID: 'message-1',
      callID: 'call-1',
      type: 'tool',
      tool: 'task',
      state: {
        status: 'error',
        input: {
          subagent_type: 'general-purpose',
        },
        error: 'The user has specified a rule which prevents you from using this specific tool call.',
        time: { start: 100, end: 120 },
      },
    } as Part, 'message-1', 0);

    expect(invocation).toBe(undefined);
  });
});
