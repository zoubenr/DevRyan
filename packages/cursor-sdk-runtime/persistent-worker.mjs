import { createInterface } from 'node:readline';
import process from 'node:process';
import { configureCursorSdkRipgrep } from './ripgrep-path.js';

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const firstStringValue = (...candidates) => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }
  return '';
};

// Upper bound on how long we wait for an SDK run cancel to settle before we
// force the request to finish. Prevents a hung cancel from leaving the host
// stream stuck mid-tool (a cause of the "stop then switch models" freeze).
const CANCEL_TIMEOUT_MS = 4000;

const withTimeout = (promise, timeoutMs) => {
  if (!promise || !timeoutMs) return Promise.resolve(promise);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, timeoutMs);
    timer.unref?.();
    Promise.resolve(promise).then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } },
    );
  });
};

const sdkStatusFromRunStatus = (status) => {
  if (status === 'finished') return 'FINISHED';
  if (status === 'error') return 'ERROR';
  if (status === 'cancelled') return 'CANCELLED';
  return 'RUNNING';
};

const finalStatusFromSdkStatus = (status) => {
  const normalized = trimString(status).toUpperCase();
  if (normalized === 'FINISHED' || normalized === 'FINISH' || normalized === 'SUCCESS' || normalized === 'STOP' || normalized === 'COMPLETED') return 'success';
  if (normalized === 'ERROR' || normalized === 'FAILED' || normalized === 'FAILURE') return 'error';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED' || normalized === 'EXPIRED') return 'cancelled';
  return null;
};

const normalizeToolCallStatus = (status) => {
  const normalized = trimString(status).toLowerCase();
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done' || normalized === 'success' || normalized === 'finished') return 'completed';
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') return 'error';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'pending') return 'pending';
  return 'running';
};

const normalizeInteractionUpdateToSdkMessage = (input) => {
  const update = isPlainObject(input?.update) ? input.update : input;
  if (!isPlainObject(update)) return null;

  if (update.type === 'text-delta' || update.type === 'token-delta') {
    const text = firstStringValue(update.text, update.delta, update.token);
    return text
      ? {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text }],
          },
        }
      : null;
  }

  if (update.type === 'thinking-delta') {
    const text = firstStringValue(update.text, update.delta);
    return text ? { type: 'thinking', text } : null;
  }

  if (
    update.type === 'thinking-completed'
    || update.type === 'thinking_completed'
    || update.type === 'thinking-complete'
  ) {
    return { type: 'thinking_completed' };
  }

  if (
    update.type === 'tool-call-started'
    || update.type === 'partial-tool-call'
    || update.type === 'tool-call-completed'
  ) {
    const toolCall = isPlainObject(update.toolCall) ? update.toolCall : {};
    const callID = trimString(update.callId ?? update.call_id ?? toolCall.callId ?? toolCall.call_id ?? toolCall.id);
    const name = trimString(toolCall.name ?? toolCall.type ?? update.name) || 'tool';
    const status = update.type === 'tool-call-completed'
      ? 'completed'
      : normalizeToolCallStatus(update.status);
    return {
      type: 'tool_call',
      call_id: callID,
      name,
      status,
      ...(hasOwn(toolCall, 'args') ? { args: toolCall.args } : {}),
      ...(hasOwn(toolCall, 'result') ? { result: toolCall.result } : {}),
      ...(isPlainObject(toolCall.truncated) ? { truncated: toolCall.truncated } : {}),
    };
  }

  if (update.type === 'summary') {
    const text = trimString(update.summary ?? update.text);
    return text ? { type: 'task', text } : null;
  }

  return null;
};

const getSdkMessageTextFingerprint = (message) => {
  if (!isPlainObject(message)) return '';
  if (message.type === 'assistant') {
    const content = Array.isArray(message.message?.content) ? message.message.content : [];
    const text = content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    return text ? `assistant:${text}` : '';
  }
  if (message.type === 'thinking') {
    const text = typeof message.text === 'string' ? message.text : '';
    return text ? `thinking:${text}` : '';
  }
  return '';
};

const createCrossSourceMessageDedupe = (limit = 80) => {
  const recent = [];
  return (source, message) => {
    const fingerprint = getSdkMessageTextFingerprint(message);
    if (!fingerprint) return false;
    const duplicate = recent.some((entry) => (
      entry.fingerprint === fingerprint && entry.source !== source
    ));
    recent.push({ source, fingerprint });
    if (recent.length > limit) {
      recent.splice(0, recent.length - limit);
    }
    return duplicate;
  };
};

const normalizeModelSelectionParams = (params) => {
  if (!Array.isArray(params)) return [];
  const normalized = [];
  for (const param of params) {
    if (!isPlainObject(param)) continue;
    const id = trimString(param.id);
    const value = trimString(param.value);
    if (!id || !value) continue;
    normalized.push({ id, value });
  }
  return normalized;
};

const normalizeModelSelection = (selection, fallbackModelID) => {
  if (!isPlainObject(selection)) {
    return { id: trimString(fallbackModelID) || 'auto' };
  }
  const id = trimString(selection.id) || trimString(fallbackModelID) || 'auto';
  const params = normalizeModelSelectionParams(selection.params);
  return {
    id,
    ...(params.length > 0 ? { params } : {}),
  };
};

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObjectKeys(entry)])
  );
};

const stableJson = (value) => {
  try {
    return JSON.stringify(sortObjectKeys(value));
  } catch {
    return JSON.stringify(value);
  }
};

const normalizeAgentDefinitions = (value) => {
  if (!isPlainObject(value)) return null;
  const definitions = {};
  for (const [rawName, rawDefinition] of Object.entries(value)) {
    const name = trimString(rawName);
    if (!name || !isPlainObject(rawDefinition)) continue;
    const prompt = trimString(rawDefinition.prompt);
    if (!prompt) continue;
    definitions[name] = {
      description: trimString(rawDefinition.description) || `${name} subagent`,
      prompt,
      model: 'inherit',
    };
  }
  return Object.keys(definitions).length > 0 ? definitions : null;
};

const isMissingCursorAgentError = (error) => /Agent .* not found/i.test(error instanceof Error ? error.message : String(error || ''));

const writeEvent = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

const writeRequestEvent = (requestID, event) => {
  writeEvent({ requestID, ...event });
};

const agentCache = new Map();
const activeRuns = new Map();
const cursorSdk = await import('@cursor/sdk');
configureCursorSdkRipgrep(cursorSdk, { env: process.env });
const { Agent } = cursorSdk;

writeEvent({ type: 'ready' });

const getAgentCacheKey = (sessionID, directory, model, agents) => `${trimString(sessionID)}\u0000${trimString(directory)}\u0000${stableJson({
  model: normalizeModelSelection(model),
  agents: normalizeAgentDefinitions(agents),
})}`;

const getOrCreateAgent = async ({ apiKey, sessionID, model, directory, agentID, agents }) => {
  const normalizedAgents = normalizeAgentDefinitions(agents);
  const key = getAgentCacheKey(sessionID, directory, model, normalizedAgents);
  const cached = agentCache.get(key);
  if (cached) return cached;

  const local = directory ? { cwd: directory } : {};
  const agentOptions = {
    apiKey,
    model,
    local,
    ...(normalizedAgents ? { agents: normalizedAgents } : {}),
  };
  let agent = null;
  if (agentID) {
    try {
      agent = await Agent.resume(agentID, agentOptions);
    } catch (error) {
      if (!isMissingCursorAgentError(error)) {
        throw error;
      }
    }
  }
  if (!agent) {
    agent = await Agent.create({
      name: `DevRyan ${trimString(sessionID) || Date.now()}`,
      ...agentOptions,
    });
  }
  agentCache.set(key, agent);
  return agent;
};

const handlePrompt = async (command) => {
  const requestID = trimString(command.requestID);
  const apiKey = trimString(command.apiKey);
  const modelID = trimString(command.modelID) || 'auto';
  const model = normalizeModelSelection(command.modelSelection, modelID);
  const agents = normalizeAgentDefinitions(command.agents);
  const prompt = trimString(command.prompt);
  const directory = trimString(command.directory);
  const sessionID = trimString(command.sessionID);
  const agentID = trimString(command.agentID);
  const images = Array.isArray(command.images) ? command.images : [];

  if (!requestID) return;
  if (!apiKey) throw new Error('Cursor SDK API key is not configured.');
  if (!prompt) throw new Error('Cursor prompt is required.');

  const state = {
    run: null,
    cancelRequested: false,
    streamIterator: null,
  };
  activeRuns.set(requestID, state);

  const shouldSkipDuplicateMessage = createCrossSourceMessageDedupe();
  const writeSdkMessage = (sdkMessage, source = 'stream') => {
    if (shouldSkipDuplicateMessage(source, sdkMessage)) return;
    writeRequestEvent(requestID, { type: 'message', message: sdkMessage });
  };

  const writeTiming = (mark, metadata) => {
    writeRequestEvent(requestID, {
      type: 'timing',
      mark,
      ...(metadata ? { metadata } : {}),
    });
  };

  try {
    writeTiming('cursor_run_create_started');
    const agent = await getOrCreateAgent({ apiKey, sessionID, model, directory, agentID, agents });
    if (agent?.agentId) {
      writeRequestEvent(requestID, { type: 'agent', agentID: agent.agentId });
    }

    let sawSdkDelta = false;
    const message = images.length > 0 ? { text: prompt, images } : { text: prompt };
    const run = await agent.send(message, {
      model,
      onDelta: (event) => {
        const sdkMessage = normalizeInteractionUpdateToSdkMessage(event);
        if (!sdkMessage) return;
        if (!sawSdkDelta) {
          sawSdkDelta = true;
          writeTiming('cursor_first_sdk_delta');
        }
        writeSdkMessage(sdkMessage, 'delta');
      },
    });
    state.run = run;
    writeTiming('cursor_run_created');
    if (state.cancelRequested && typeof run.cancel === 'function') {
      await run.cancel();
    }

    let doneEmitted = false;
    const writeDone = (status) => {
      if (doneEmitted) return;
      doneEmitted = true;
      writeSdkMessage({
        type: 'status',
        agent_id: run.agentId,
        run_id: run.id,
        status: sdkStatusFromRunStatus(status),
      });
      writeRequestEvent(requestID, { type: 'done', status });
    };

    const closeStreamIterator = async () => {
      if (state.streamIterator && typeof state.streamIterator.return === 'function') {
        await state.streamIterator.return();
      }
    };

    // Let a cancel force a terminal "done" even if the SDK cancel is slow or
    // never settles, so the host stream is never left hanging mid-tool. writeDone
    // is idempotent, so this is safe alongside the natural completion path.
    state.finishCancelled = () => {
      writeDone('cancelled');
      void closeStreamIterator();
    };

    const waitPromise = run.wait()
      .then((result) => {
        const finalText = trimString(result?.result);
        const finalStatus = finalStatusFromSdkStatus(sdkStatusFromRunStatus(result?.status || run.status));
        writeRequestEvent(requestID, {
          type: 'final-result',
          result: {
            ok: true,
            finalStatus,
            finalText,
          },
        });
        if (finalText) {
          writeSdkMessage({
            type: 'assistant',
            agent_id: run.agentId,
            run_id: run.id,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: finalText }],
            },
          }, 'wait');
        }
        writeDone(result?.status || run.status);
        void closeStreamIterator();
      })
      .catch((error) => {
        writeRequestEvent(requestID, {
          type: 'final-result',
          result: {
            ok: false,
            finalStatus: 'error',
            finalText: '',
            error: error instanceof Error ? error.message : 'Cursor SDK run failed.',
          },
        });
        writeRequestEvent(requestID, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Cursor SDK run failed.',
        });
      });

    let sawStreamEvent = false;
    state.streamIterator = run.stream()[Symbol.asyncIterator]();
    for (;;) {
      const next = await state.streamIterator.next();
      if (next.done) break;
      if (!sawStreamEvent) {
        sawStreamEvent = true;
        writeTiming('cursor_first_stream_event');
      }
      writeSdkMessage(next.value, 'stream');
    }

    await waitPromise;
    writeDone(run.status);
  } catch (error) {
    writeRequestEvent(requestID, {
      type: 'final-result',
      result: {
        ok: false,
        finalStatus: 'error',
        finalText: '',
        error: error instanceof Error ? error.message : 'Cursor SDK worker failed.',
      },
    });
    writeRequestEvent(requestID, {
      type: 'error',
      error: error instanceof Error ? error.message : 'Cursor SDK worker failed.',
    });
  } finally {
    activeRuns.delete(requestID);
  }
};

const cancelRun = async (requestID) => {
  const active = activeRuns.get(requestID);
  if (!active) return;
  active.cancelRequested = true;
  if (active.run && typeof active.run.cancel === 'function') {
    // Bound the SDK cancel so a hung cancel cannot keep the request alive.
    await withTimeout(Promise.resolve(active.run.cancel()), CANCEL_TIMEOUT_MS);
  }
  // Always emit a terminal done so the host never waits forever for a stream
  // that stopped producing events after cancellation.
  active.finishCancelled?.();
};

const shutdown = async () => {
  for (const requestID of [...activeRuns.keys()]) {
    await cancelRun(requestID);
  }
  process.exit(0);
};

process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (!trimString(line)) continue;
  let command = null;
  try {
    command = JSON.parse(line);
  } catch {
    continue;
  }
  if (command?.type === 'prompt') {
    void handlePrompt(command);
  } else if (command?.type === 'cancel') {
    void cancelRun(trimString(command.requestID));
  } else if (command?.type === 'shutdown') {
    await shutdown();
  }
}
