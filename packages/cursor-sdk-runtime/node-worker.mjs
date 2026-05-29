import process from 'node:process';

const readStdin = async () => {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  return JSON.parse(raw);
};

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

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

const isMissingCursorAgentError = (error) => /Agent .* not found/i.test(error instanceof Error ? error.message : String(error || ''));

const writeEvent = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const firstStringValue = (...candidates) => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }
  return '';
};

const sdkStatusFromRunStatus = (status) => {
  if (status === 'finished') return 'FINISHED';
  if (status === 'error') return 'ERROR';
  if (status === 'cancelled') return 'CANCELLED';
  return 'RUNNING';
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

const main = async () => {
  const input = await readStdin();
  const apiKey = trimString(input.apiKey);
  const modelID = trimString(input.modelID) || 'auto';
  const modelSelection = normalizeModelSelection(input.modelSelection, modelID);
  const prompt = trimString(input.prompt);
  const images = Array.isArray(input.images)
    ? input.images
      .filter((image) => isPlainObject(image) && trimString(image.url))
      .map((image) => ({ url: trimString(image.url) }))
    : [];
  const directory = trimString(input.directory);
  const agentID = trimString(input.agentID);

  if (!apiKey) throw new Error('Cursor SDK API key is not configured.');
  if (!prompt) throw new Error('Cursor prompt is required.');

  const { Agent } = await import('@cursor/sdk');
  const model = modelSelection;
  const local = directory ? { cwd: directory } : {};
  let agent = null;
  if (agentID) {
    try {
      agent = await Agent.resume(agentID, { apiKey, model, local });
    } catch (error) {
      if (!isMissingCursorAgentError(error)) {
        throw error;
      }
    }
  }
  if (!agent) {
    agent = await Agent.create({
      apiKey,
      model,
      name: `DevRyan ${trimString(input.sessionID) || Date.now()}`,
      local,
    });
  }

  if (agent?.agentId) {
    writeEvent({ type: 'agent', agentID: agent.agentId });
  }

  const message = images.length > 0 ? { text: prompt, images } : { text: prompt };
  const shouldSkipDuplicateMessage = createCrossSourceMessageDedupe();
  const run = await agent.send(message, {
    model,
    onDelta: (event) => {
      const sdkMessage = normalizeInteractionUpdateToSdkMessage(event);
      if (!sdkMessage) return;
      writeSdkMessage(sdkMessage, 'delta');
    },
  });
  let doneEmitted = false;
  function writeSdkMessage(sdkMessage, source = 'stream') {
    if (shouldSkipDuplicateMessage(source, sdkMessage)) return;
    writeEvent({ type: 'message', message: sdkMessage });
  }
  const writeDone = (status) => {
    if (doneEmitted) return;
    doneEmitted = true;
    writeEvent({
      type: 'message',
      message: {
        type: 'status',
        agent_id: run.agentId,
        run_id: run.id,
        status: sdkStatusFromRunStatus(status),
      },
    });
    writeEvent({ type: 'done', status });
  };

  const disposeStatusListener = typeof run.onDidChangeStatus === 'function'
    ? run.onDidChangeStatus((status) => {
      writeEvent({
        type: 'message',
        message: {
          type: 'status',
          agent_id: run.agentId,
          run_id: run.id,
          status: sdkStatusFromRunStatus(status),
        },
      });
    })
    : () => {};

  const waitPromise = run.wait()
    .then((result) => {
      if (trimString(result?.result)) {
        writeSdkMessage({
          type: 'assistant',
          agent_id: run.agentId,
          run_id: run.id,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: result.result }],
          },
        }, 'wait');
      }
      writeDone(result?.status || run.status);
      setTimeout(() => process.exit(0), 25).unref?.();
    })
    .catch((error) => {
      writeEvent({
        type: 'error',
        error: error instanceof Error ? error.message : 'Cursor SDK run failed.',
      });
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 25).unref?.();
    })
    .finally(() => {
      disposeStatusListener();
    });

  let shuttingDown = false;
  const cancel = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (typeof run.cancel === 'function') {
        await run.cancel();
      }
    } finally {
      process.exit(130);
    }
  };

  process.once('SIGTERM', () => {
    void cancel();
  });
  process.once('SIGINT', () => {
    void cancel();
  });

  for await (const message of run.stream()) {
    writeSdkMessage(message, 'stream');
  }

  await waitPromise;
  writeDone(run.status);
};

main().catch((error) => {
  writeEvent({
    type: 'error',
    error: error instanceof Error ? error.message : 'Cursor SDK worker failed.',
  });
  process.exitCode = 1;
});
