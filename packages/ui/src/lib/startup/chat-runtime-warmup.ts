import { importWithChunkRecovery } from '@/lib/chunkLoadRecovery';

const DEFAULT_CHAT_RUNTIME_WARMUP_TIMEOUT_MS = 3_000;

type WarmupTask = () => Promise<unknown>;

export type ChatRuntimeWarmupResult = {
  status: 'ready';
  timedOut: boolean;
  errors: string[];
};

type WarmChatRuntimeOptions = {
  timeoutMs?: number;
  tasks?: WarmupTask[];
};

const defaultWarmupTasks: WarmupTask[] = [
  () => importWithChunkRecovery(() => import('@/components/chat/MarkdownRendererImpl')),
  () => importWithChunkRecovery(() => import('@/components/chat/message/ToolOutputDialog')),
];

const formatWarmupError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const warmChatRuntime = async (
  options: WarmChatRuntimeOptions = {},
): Promise<ChatRuntimeWarmupResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHAT_RUNTIME_WARMUP_TIMEOUT_MS;
  const tasks = options.tasks ?? defaultWarmupTasks;

  const warmup = Promise.allSettled(tasks.map((task) => task()));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<'timeout'>((resolve) => {
    timeout = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const result = await Promise.race([warmup, timeoutResult]);
  if (timeout) {
    clearTimeout(timeout);
  }

  if (result === 'timeout') {
    warmup.then((settled) => {
      const errors = settled
        .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
        .map((item) => formatWarmupError(item.reason));
      if (errors.length > 0) {
        console.warn('[startup] chat runtime warmup completed after timeout with errors:', errors);
      }
    }).catch(() => undefined);
    return {
      status: 'ready',
      timedOut: true,
      errors: [],
    };
  }

  const errors = result
    .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
    .map((item) => formatWarmupError(item.reason));

  if (errors.length > 0) {
    console.warn('[startup] chat runtime warmup failed; continuing startup:', errors);
  }

  return {
    status: 'ready',
    timedOut: false,
    errors,
  };
};
