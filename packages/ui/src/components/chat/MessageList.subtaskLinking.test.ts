import { describe, expect, test } from 'bun:test';
import type { Part } from '@opencode-ai/sdk/v2';
import type { ChatMessageEntry } from './lib/turns/types';
import { projectSubtaskBridgeMessage } from './lib/subtaskBridge';
import type { TaskSessionAssignment } from './lib/taskSessionLinking';

const message = (id: string, role: 'user' | 'assistant', parts: ChatMessageEntry['parts'], sessionID = 'parent-session'): ChatMessageEntry => ({
  info: {
    id,
    role,
    sessionID,
    time: { created: 1 },
  } as ChatMessageEntry['info'],
  parts,
});

const subtaskPart = (id = 'subtask-1', agent = 'explorer'): Part => ({
  id,
  type: 'subtask',
  sessionID: 'parent-session',
  messageID: 'user-1',
  description: 'Find files',
  prompt: 'Find the code',
  agent,
} as unknown as Part);

const taskToolPart = (id = 'task-tool-1', messageID = 'assistant-1', callID = 'call-1'): Part => ({
  id,
  type: 'tool',
  sessionID: 'parent-session',
  messageID,
  callID,
  tool: 'task',
  state: {
    status: 'completed',
    input: {
      subagent_type: 'explorer',
    },
  },
} as unknown as Part);

const assignments = (entries: Array<[string, TaskSessionAssignment]>): Map<string, TaskSessionAssignment> => {
  return new Map(entries);
};

describe('projectSubtaskBridgeMessage', () => {
  test('links a user subtask from authoritative child sessions and hides the synthetic task bridge', () => {
    const previous = message('user-1', 'user', [subtaskPart()]);
    const current = message('assistant-1', 'assistant', [taskToolPart()]);

    const result = projectSubtaskBridgeMessage(previous, current, assignments([
      ['parent-session:assistant-1:call-1', { sessionId: 'child-explorer', agent: 'explorer', source: 'inferred' }],
    ]));

    expect(result.hide).toBe(true);
    expect(((result.previous as ChatMessageEntry).parts[0] as { taskSessionID?: string }).taskSessionID).toBe('child-explorer');
  });

  test('keeps the task bridge visible when child candidates are ambiguous', () => {
    const previous = message('user-1', 'user', [subtaskPart()]);
    const current = message('assistant-1', 'assistant', [taskToolPart()]);

    const result = projectSubtaskBridgeMessage(previous, current, assignments([]));

    expect(result.hide).toBe(false);
    expect(((result.previous as ChatMessageEntry).parts[0] as { taskSessionID?: string }).taskSessionID).toBe(undefined);
  });

  test('does not hide repeated task bridges unless that specific task key is assigned', () => {
    const firstPrevious = message('user-1', 'user', [subtaskPart('subtask-1')]);
    const firstCurrent = message('assistant-1', 'assistant', [taskToolPart('task-tool-1', 'assistant-1', 'call-1')]);
    const secondPrevious = message('user-2', 'user', [subtaskPart('subtask-2')]);
    const secondCurrent = message('assistant-2', 'assistant', [taskToolPart('task-tool-2', 'assistant-2', 'call-2')]);
    const taskAssignments = assignments([
      ['parent-session:assistant-2:call-2', { sessionId: 'child-2', agent: 'explorer', source: 'inferred' }],
    ]);

    const first = projectSubtaskBridgeMessage(firstPrevious, firstCurrent, taskAssignments);
    const second = projectSubtaskBridgeMessage(secondPrevious, secondCurrent, taskAssignments);

    expect(first.hide).toBe(false);
    expect(second.hide).toBe(true);
    expect(((second.previous as ChatMessageEntry).parts[0] as { taskSessionID?: string }).taskSessionID).toBe('child-2');
  });
});
