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

const isMissingCursorAgentError = (error) => /Agent .* not found/i.test(error instanceof Error ? error.message : String(error || ''));

const writeEvent = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

const sdkStatusFromRunStatus = (status) => {
  if (status === 'finished') return 'FINISHED';
  if (status === 'error') return 'ERROR';
  if (status === 'cancelled') return 'CANCELLED';
  return 'RUNNING';
};

const main = async () => {
  const input = await readStdin();
  const apiKey = trimString(input.apiKey);
  const modelID = trimString(input.modelID) || 'auto';
  const prompt = trimString(input.prompt);
  const directory = trimString(input.directory);
  const agentID = trimString(input.agentID);

  if (!apiKey) throw new Error('Cursor SDK API key is not configured.');
  if (!prompt) throw new Error('Cursor prompt is required.');

  const { Agent } = await import('@cursor/sdk');
  const model = { id: modelID };
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

  const run = await agent.send({ text: prompt }, { model });
  let doneEmitted = false;
  let sawAssistantText = false;
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
      if (!sawAssistantText && trimString(result?.result)) {
        writeEvent({
          type: 'message',
          message: {
            type: 'assistant',
            agent_id: run.agentId,
            run_id: run.id,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: result.result }],
            },
          },
        });
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
    if (message?.type === 'assistant') {
      const content = Array.isArray(message.message?.content) ? message.message.content : [];
      sawAssistantText ||= content.some((block) => block?.type === 'text' && trimString(block.text));
    }
    writeEvent({ type: 'message', message });
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
