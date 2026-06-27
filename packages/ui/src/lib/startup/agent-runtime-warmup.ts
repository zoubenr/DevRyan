const DEFAULT_AGENT_RUNTIME_WARMUP_TIMEOUT_MS = 75_000;

export type AgentRuntimeWarmupTask = {
  name: string;
  status: 'ready' | 'error' | 'timeout';
  durationMs: number;
  error?: string;
};

export type AgentRuntimeWarmupResult = {
  status: 'ready';
  timedOut: boolean;
  tasks: AgentRuntimeWarmupTask[];
  errors: string[];
};

type WarmAgentRuntimeOptions = {
  directory?: string | null;
  timeoutMs?: number;
};

const formatWarmupError = (error: unknown): string => {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Timed out';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const normalizeBackendResult = (value: unknown): AgentRuntimeWarmupResult => {
  const result = value && typeof value === 'object' ? value as {
    status?: unknown;
    timedOut?: unknown;
    tasks?: unknown;
  } : {};
  const tasks = Array.isArray(result.tasks)
    ? result.tasks.filter((task): task is AgentRuntimeWarmupTask => {
      if (!task || typeof task !== 'object') return false;
      const candidate = task as AgentRuntimeWarmupTask;
      return typeof candidate.name === 'string'
        && (candidate.status === 'ready' || candidate.status === 'error' || candidate.status === 'timeout')
        && typeof candidate.durationMs === 'number';
    })
    : [];

  return {
    status: 'ready',
    timedOut: result.timedOut === true || tasks.some((task) => task.status === 'timeout'),
    tasks,
    errors: tasks
      .filter((task) => task.status === 'error' && typeof task.error === 'string' && task.error.length > 0)
      .map((task) => task.error as string),
  };
};

export const warmAgentRuntime = async (
  options: WarmAgentRuntimeOptions = {},
): Promise<AgentRuntimeWarmupResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_RUNTIME_WARMUP_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const request = fetch('/api/startup/agent-runtime-warmup', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ directory: options.directory ?? null }),
    signal: controller?.signal,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Warmup failed (${response.status})`);
    }
    return normalizeBackendResult(await response.json().catch(() => null));
  });

  const timeoutResult = new Promise<'timeout'>((resolve) => {
    timeout = setTimeout(() => {
      if (controller) controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([request, timeoutResult]);
    if (timeout) {
      clearTimeout(timeout);
    }

    if (result === 'timeout') {
      request.catch(() => undefined);
      return {
        status: 'ready',
        timedOut: true,
        tasks: [],
        errors: [],
      };
    }

    if (result.errors.length > 0) {
      console.warn('[startup] agent runtime warmup completed with errors:', result.errors);
    }
    return result;
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout);
    }
    return {
      status: 'ready',
      timedOut: false,
      tasks: [],
      errors: [formatWarmupError(error)],
    };
  }
};
