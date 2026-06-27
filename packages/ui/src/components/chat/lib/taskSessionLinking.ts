import type { Part, Session } from '@opencode-ai/sdk/v2';
import { readTaskSessionIdFromOutput, readTaskSessionIdFromRecord } from '../message/parts/taskToolUtils';

export type TaskSessionInvocation = {
  key: string;
  parentSessionId: string;
  order: number;
  explicitSessionId?: string;
  subagentType?: string;
  taskStartTime?: number;
  taskEndTime?: number;
};

export type TaskSessionAssignment = {
  sessionId?: string;
  agent?: string;
  source?: 'explicit' | 'inferred';
};

export type ResolveTaskSessionAssignmentsParams = {
  parentSessionId: string | undefined;
  tasks: TaskSessionInvocation[];
  childSessions: Session[];
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeAgentName = (value: unknown): string => {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

const getSessionAgent = (session: Session): string | undefined => {
  return normalizeString((session as Session & { agent?: unknown }).agent);
};

const getNormalizedSessionAgent = (session: Session): string => {
  return normalizeAgentName(getSessionAgent(session));
};

const getSessionCreatedAt = (session: Session): number => {
  const created = session.time?.created;
  return typeof created === 'number' && Number.isFinite(created) ? created : Number.POSITIVE_INFINITY;
};

const compareTasks = (left: TaskSessionInvocation, right: TaskSessionInvocation): number => {
  const leftStart = typeof left.taskStartTime === 'number' ? left.taskStartTime : Number.POSITIVE_INFINITY;
  const rightStart = typeof right.taskStartTime === 'number' ? right.taskStartTime : Number.POSITIVE_INFINITY;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.key.localeCompare(right.key);
};

const compareSessions = (left: Session, right: Session): number => {
  const createdDelta = getSessionCreatedAt(left) - getSessionCreatedAt(right);
  if (createdDelta !== 0) {
    return createdDelta;
  }
  return left.id.localeCompare(right.id);
};

const findChild = (children: Session[], sessionId: string | undefined): Session | undefined => {
  if (!sessionId) {
    return undefined;
  }
  return children.find((child) => child.id === sessionId);
};

const resolveSingleByTaskWindow = (task: TaskSessionInvocation, children: Session[]): Session | undefined => {
  if (typeof task.taskStartTime !== 'number' && typeof task.taskEndTime !== 'number') {
    return undefined;
  }
  const matches = children.filter((child) => {
    const created = getSessionCreatedAt(child);
    if (!Number.isFinite(created)) {
      return false;
    }
    if (typeof task.taskStartTime === 'number' && created < task.taskStartTime) {
      return false;
    }
    if (typeof task.taskEndTime === 'number' && created > task.taskEndTime) {
      return false;
    }
    return true;
  });
  return matches.length === 1 ? matches[0] : undefined;
};

const assignChild = (
  assignments: Map<string, TaskSessionAssignment>,
  claimedChildIds: Set<string>,
  task: TaskSessionInvocation,
  child: Session,
  source: 'explicit' | 'inferred',
) => {
  assignments.set(task.key, {
    sessionId: child.id,
    agent: getSessionAgent(child),
    source,
  });
  claimedChildIds.add(child.id);
};

export const buildTaskInvocationKey = (params: {
  parentSessionId?: string;
  messageId?: string;
  partId?: string;
  callId?: string;
}): string | undefined => {
  const parentSessionId = normalizeString(params.parentSessionId);
  const messageId = normalizeString(params.messageId);
  const partIdentity = normalizeString(params.callId) ?? normalizeString(params.partId);
  if (!parentSessionId || !messageId || !partIdentity) {
    return undefined;
  }
  return `${parentSessionId}:${messageId}:${partIdentity}`;
};

export const buildTaskInvocationSignature = (tasks: TaskSessionInvocation[]): string => {
  if (tasks.length === 0) {
    return 'tasks:0';
  }
  return tasks
    .map((task) => `${task.key}:${task.explicitSessionId ?? ''}:${task.subagentType ?? ''}:${task.taskStartTime ?? ''}:${task.taskEndTime ?? ''}`)
    .sort()
    .join('|');
};

export const resolveTaskSessionAssignments = ({
  parentSessionId,
  tasks,
  childSessions,
}: ResolveTaskSessionAssignmentsParams): Map<string, TaskSessionAssignment> => {
  const normalizedParentId = normalizeString(parentSessionId);
  const assignments = new Map<string, TaskSessionAssignment>();
  if (!normalizedParentId || tasks.length === 0) {
    return assignments;
  }

  const parentTasks = tasks
    .filter((task) => task.parentSessionId === normalizedParentId)
    .sort(compareTasks);
  const parentChildren = childSessions
    .filter((session) => Boolean(session?.id) && session.parentID === normalizedParentId)
    .sort(compareSessions);
  const claimedChildIds = new Set<string>();

  for (const task of parentTasks) {
    const explicitSessionId = normalizeString(task.explicitSessionId);
    if (!explicitSessionId) {
      continue;
    }
    const child = findChild(parentChildren, explicitSessionId);
    assignments.set(task.key, {
      sessionId: explicitSessionId,
      agent: child ? getSessionAgent(child) : undefined,
      source: 'explicit',
    });
    claimedChildIds.add(explicitSessionId);
  }

  const inferredTasks = parentTasks.filter((task) => !assignments.has(task.key));
  if (inferredTasks.length === 0) {
    return assignments;
  }

  const availableChildren = () => parentChildren.filter((child) => !claimedChildIds.has(child.id));
  const tasksByAgent = new Map<string, TaskSessionInvocation[]>();
  const tasksWithoutAgent: TaskSessionInvocation[] = [];

  for (const task of inferredTasks) {
    const requestedAgent = normalizeAgentName(task.subagentType);
    if (!requestedAgent) {
      tasksWithoutAgent.push(task);
      continue;
    }
    const list = tasksByAgent.get(requestedAgent) ?? [];
    list.push(task);
    tasksByAgent.set(requestedAgent, list);
  }

  for (const [agent, agentTasks] of tasksByAgent) {
    const orderedTasks = [...agentTasks].sort(compareTasks);
    const matchingChildren = availableChildren()
      .filter((child) => getNormalizedSessionAgent(child) === agent)
      .sort(compareSessions);

    if (orderedTasks.length === 1) {
      const [onlyTask] = orderedTasks;
      if (matchingChildren.length === 1) {
        assignChild(assignments, claimedChildIds, onlyTask, matchingChildren[0], 'inferred');
        continue;
      }
      const timedChild = resolveSingleByTaskWindow(onlyTask, matchingChildren);
      if (timedChild) {
        assignChild(assignments, claimedChildIds, onlyTask, timedChild, 'inferred');
      }
      continue;
    }

    if (matchingChildren.length !== orderedTasks.length) {
      continue;
    }

    orderedTasks.forEach((task, index) => {
      const child = matchingChildren[index];
      if (child) {
        assignChild(assignments, claimedChildIds, task, child, 'inferred');
      }
    });
  }

  for (const task of tasksWithoutAgent.sort(compareTasks)) {
    if (assignments.has(task.key)) {
      continue;
    }
    const children = availableChildren();
    if (tasksWithoutAgent.length === 1 && children.length === 1) {
      assignChild(assignments, claimedChildIds, task, children[0], 'inferred');
      continue;
    }
    const timedChild = resolveSingleByTaskWindow(task, children);
    if (timedChild) {
      assignChild(assignments, claimedChildIds, task, timedChild, 'inferred');
    }
  }

  return assignments;
};

export const readTaskExplicitSessionId = (toolPart: Part): string | undefined => {
  const partRecord = toolPart as unknown as {
    metadata?: unknown;
    state?: {
      metadata?: unknown;
      output?: unknown;
    };
  };
  return (
    readTaskSessionIdFromRecord(partRecord.state?.metadata)
    ?? readTaskSessionIdFromRecord(partRecord.metadata)
    ?? readTaskSessionIdFromOutput(typeof partRecord.state?.output === 'string' ? partRecord.state.output : undefined)
  );
};

export const createTaskInvocationFromToolPart = (
  toolPart: Part,
  messageId: string | undefined,
  order: number,
): TaskSessionInvocation | undefined => {
  const partRecord = toolPart as unknown as {
    id?: unknown;
    type?: unknown;
    tool?: unknown;
    sessionID?: unknown;
    messageID?: unknown;
    callID?: unknown;
    state?: {
      status?: unknown;
      input?: Record<string, unknown>;
      time?: { start?: unknown; end?: unknown };
    };
  };
  if (partRecord.type !== 'tool' || normalizeAgentName(partRecord.tool) !== 'task') {
    return undefined;
  }
  const parentSessionId = normalizeString(partRecord.sessionID);
  const resolvedMessageId = normalizeString(partRecord.messageID) ?? normalizeString(messageId);
  const key = buildTaskInvocationKey({
    parentSessionId,
    messageId: resolvedMessageId,
    partId: normalizeString(partRecord.id),
    callId: normalizeString(partRecord.callID),
  });
  if (!key || !parentSessionId) {
    return undefined;
  }
  const explicitSessionId = readTaskExplicitSessionId(toolPart);
  const status = normalizeAgentName(partRecord.state?.status);
  if ((status === 'error' || status === 'failed') && !explicitSessionId) {
    return undefined;
  }
  const input = partRecord.state?.input;
  const subagentType = typeof input?.subagent_type === 'string' ? input.subagent_type : undefined;
  const start = partRecord.state?.time?.start;
  const end = partRecord.state?.time?.end;
  return {
    key,
    parentSessionId,
    order,
    explicitSessionId,
    subagentType,
    taskStartTime: typeof start === 'number' && Number.isFinite(start) ? start : undefined,
    taskEndTime: typeof end === 'number' && Number.isFinite(end) ? end : undefined,
  };
};
