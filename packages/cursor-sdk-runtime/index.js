import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  normalizePlanModeAssistantParts,
  PLAN_MODE_INSTRUCTION_PREFIX,
} from './plan-card-normalize.js';

export const CURSOR_PROVIDER_ID = 'cursor-acp';

const FALLBACK_MODELS = [
  ['auto', 'Auto'],
  ['composer-2.5', 'Composer 2.5'],
  ['composer-2.5-fast', 'Composer 2.5 Fast'],
  ['composer-2', 'Composer 2'],
  ['composer-2-fast', 'Composer 2 Fast'],
  ['claude-4.6-sonnet', 'Claude 4.6 Sonnet'],
  ['claude-4.5-sonnet', 'Claude 4.5 Sonnet'],
  ['gpt-5.5', 'GPT-5.5'],
  ['gpt-5.4', 'GPT-5.4'],
  ['gpt-5.3-codex', 'GPT-5.3 Codex'],
  ['gemini-3-pro', 'Gemini 3 Pro'],
];

const COMPATIBILITY_MODEL_PAIRS = [
  ['composer-2.5', 'Composer 2.5', 'composer-2.5-fast', 'Composer 2.5 Fast'],
  ['composer-2', 'Composer 2', 'composer-2-fast', 'Composer 2 Fast'],
];

const now = () => Date.now();

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const importRuntimeModule = (specifier) => {
  const importer = new Function('specifier', 'return import(specifier)');
  return importer(specifier);
};

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const createId = (prefix) => {
  const time = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${time}${random}`;
};

const createAssistantMessageId = (userMessageID) => `${userMessageID}_assistant`;

const normalizeFinish = (status) => {
  if (status === 'success') return 'stop';
  return status;
};

const finalStatusFromSdkStatus = (status) => {
  const normalized = trimString(status).toUpperCase();
  if (normalized === 'FINISHED' || normalized === 'FINISH' || normalized === 'SUCCESS' || normalized === 'STOP' || normalized === 'COMPLETED') return 'success';
  if (normalized === 'ERROR' || normalized === 'FAILED' || normalized === 'FAILURE') return 'error';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED' || normalized === 'EXPIRED') return 'cancelled';
  return null;
};

const sdkStatusFromRunStatus = (status) => {
  const normalized = trimString(status).toLowerCase();
  if (normalized === 'finished' || normalized === 'complete' || normalized === 'completed' || normalized === 'done') return 'FINISHED';
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') return 'ERROR';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'CANCELLED';
  return trimString(status);
};

const finishToToolStatus = (finish) => {
  if (finish === 'error') return 'error';
  if (finish === 'cancelled') return 'cancelled';
  return 'completed';
};

const normalizeToolCallStatus = (status) => {
  const normalized = trimString(status).toLowerCase();
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done' || normalized === 'success' || normalized === 'finished') return 'completed';
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') return 'error';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'pending') return 'pending';
  return 'running';
};

const isBunRuntime = () => typeof globalThis.Bun !== 'undefined';

const isMissingCursorAgentError = (error) => /Agent .* not found/i.test(error instanceof Error ? error.message : String(error || ''));

const safeJson = (value) => {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const areRuntimeValuesEqual = (left, right) => left === right || safeJson(left) === safeJson(right);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const mergeToolDataIntoState = (part) => {
  if (!isPlainObject(part) || part.type !== 'tool') {
    return { part, changed: false };
  }

  const state = isPlainObject(part.state) ? part.state : {};
  let nextState = state;
  let changed = !isPlainObject(part.state);

  const assignStateValue = (key, value, shouldAssign) => {
    if (!shouldAssign || hasOwn(nextState, key)) {
      return;
    }
    if (nextState === state) {
      nextState = { ...state };
    }
    nextState[key] = value;
    changed = true;
  };

  assignStateValue('input', part.input, isPlainObject(part.input));
  assignStateValue('output', part.output, hasOwn(part, 'output'));
  assignStateValue('metadata', part.metadata, isPlainObject(part.metadata));

  return changed ? { part: { ...part, state: nextState }, changed: true } : { part, changed: false };
};

const mergeTextDelta = (existing, incoming) => {
  const previous = typeof existing === 'string' ? existing : '';
  const next = typeof incoming === 'string' ? incoming : '';
  if (!next) return previous;
  if (!previous) return next;
  if (next.startsWith(previous)) return next;
  const needsSentenceBoundary = /[.!?)]$/.test(previous) && /^[A-Z0-9"`]/.test(next);
  return `${previous}${needsSentenceBoundary ? ' ' : ''}${next}`;
};

const mergeFinalText = (existing, incoming) => {
  const previous = typeof existing === 'string' ? existing : '';
  const next = typeof incoming === 'string' ? incoming : '';
  if (!next) return previous;
  if (!previous) return next;
  if (next === previous || previous.includes(next)) return previous;
  if (next.startsWith(previous)) return next;
  return mergeTextDelta(previous, next);
};

const DANGLING_REASONING_LIST_MARKER_PATTERN = /(?:\n\s*)+(?:[-*]|\d+[.)])\s*$/;
const SENTENCE_BOUNDARY_PATTERN = /[.!?][)"'\]]?(?=\s|$)/g;

const trimDanglingReasoningFragment = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return value;
  }

  const withoutDanglingMarker = value.replace(DANGLING_REASONING_LIST_MARKER_PATTERN, '').trimEnd();
  if (withoutDanglingMarker === value) {
    return value;
  }

  let lastBoundaryEnd = -1;
  for (const match of withoutDanglingMarker.matchAll(SENTENCE_BOUNDARY_PATTERN)) {
    lastBoundaryEnd = match.index + match[0].length;
  }
  if (lastBoundaryEnd > 0 && lastBoundaryEnd < withoutDanglingMarker.length) {
    return withoutDanglingMarker.slice(0, lastBoundaryEnd).trim();
  }

  return withoutDanglingMarker;
};

const withTimeout = async (promise, timeoutMs) => {
  if (!promise) return null;
  const boundedTimeoutMs = Math.max(0, Number(timeoutMs) || 0);
  if (!boundedTimeoutMs) return promise;

  let timeout = null;
  const timeoutPromise = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(null), boundedTimeoutMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const execFileText = (command, args, options = {}) => new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const maxOutput = 8 * 1024 * 1024;
  const timeout = setTimeout(() => {
    if (settled) return;
    child.kill('SIGTERM');
  }, options.timeoutMs || 10000);

  const append = (target, chunk) => {
    const next = `${target}${chunk}`;
    return next.length > maxOutput ? next.slice(-maxOutput) : next;
  };

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout = append(stdout, chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr = append(stderr, chunk);
  });
  child.on('error', (error) => {
    settled = true;
    clearTimeout(timeout);
    resolve({ ok: false, stdout, stderr, error });
  });
  child.on('close', (code, signal) => {
    settled = true;
    clearTimeout(timeout);
    resolve({ ok: code === 0, code, signal, stdout, stderr, error: null });
  });
});

const defaultGetWorkspaceDiff = async (directory) => {
  const cwd = trimString(directory);
  if (!cwd) return '';
  const result = await execFileText('git', ['diff', '--no-ext-diff', '--no-color', '--binary'], {
    cwd,
    timeoutMs: 10000,
  });
  return result.ok ? result.stdout : '';
};

const normalizeDiffSnapshot = (value) => trimString(value).replace(/\r\n/g, '\n');

const parsePatchStats = (patch) => {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
};

const parseUnifiedDiffFiles = (diff) => {
  const files = [];
  const lines = normalizeDiffSnapshot(diff).split('\n');
  let current = null;

  const flush = () => {
    if (!current) return;
    const patch = current.lines.join('\n').trim();
    const stats = parsePatchStats(patch);
    files.push({
      relativePath: current.path,
      filePath: current.path,
      additions: stats.additions,
      deletions: stats.deletions,
      patch,
    });
    current = null;
  };

  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      flush();
      current = {
        path: match[2] || match[1],
        lines: [line],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();

  return files.filter((file) => trimString(file.relativePath) && trimString(file.patch));
};

const buildWorkspaceDiffSummary = (files) => {
  const diffs = (Array.isArray(files) ? files : [])
    .map((file) => ({
      file: trimString(file?.relativePath || file?.filePath),
      additions: Math.max(0, Number(file?.additions) || 0),
      deletions: Math.max(0, Number(file?.deletions) || 0),
    }))
    .filter((file) => file.file);

  return diffs.length > 0 ? { diffs } : null;
};

const getCursorAuthEntry = (auth) => {
  const entry = isPlainObject(auth?.[CURSOR_PROVIDER_ID]) ? auth[CURSOR_PROVIDER_ID] : {};
  return entry;
};

export function getCursorSdkApiKey(options = {}) {
  const env = isPlainObject(options.env) ? options.env : process.env;
  const envKey = trimString(env.CURSOR_API_KEY);
  if (envKey) return envKey;

  const readAuth = typeof options.readAuth === 'function' ? options.readAuth : () => ({});
  const entry = getCursorAuthEntry(readAuth());
  return trimString(entry.key) || trimString(entry.token) || null;
}

export function isCursorUsageAuthConfigured(auth = {}) {
  return Boolean(trimString(getCursorAuthEntry(auth).usageSessionToken));
}

export function saveCursorSdkAuth({ readAuth, writeAuth, key, type = 'api' }) {
  const normalizedKey = trimString(key);
  if (!normalizedKey) {
    throw new Error('Cursor SDK API key is required.');
  }

  const auth = readAuth();
  const existing = getCursorAuthEntry(auth);
  writeAuth({
    ...auth,
    [CURSOR_PROVIDER_ID]: {
      ...existing,
      type,
      key: normalizedKey,
    },
  });
}

export function clearCursorSdkAuth({ readAuth, writeAuth }) {
  const auth = readAuth();
  const existing = getCursorAuthEntry(auth);
  const nextEntry = { ...existing };
  const hadSdkAuth =
    Object.prototype.hasOwnProperty.call(nextEntry, 'key') ||
    Object.prototype.hasOwnProperty.call(nextEntry, 'token') ||
    Object.prototype.hasOwnProperty.call(nextEntry, 'type');
  delete nextEntry.key;
  delete nextEntry.token;
  delete nextEntry.type;

  if (!hadSdkAuth) {
    return false;
  }

  writeAuth({
    ...auth,
    [CURSOR_PROVIDER_ID]: nextEntry,
  });
  return true;
}

const fallbackModelRecords = () => Object.fromEntries(
  FALLBACK_MODELS.map(([id, name]) => [id, { id, name }]),
);

const addCompatibilityModelPair = (records, id, pairedId, pairedName) => {
  if (!records[id] || records[pairedId]) return records;
  return {
    ...records,
    [pairedId]: { id: pairedId, name: pairedName },
  };
};

const addCompatibilityModelPairs = (records) => {
  let nextRecords = records;
  for (const [baseId, baseName, fastId, fastName] of COMPATIBILITY_MODEL_PAIRS) {
    nextRecords = addCompatibilityModelPair(nextRecords, baseId, fastId, fastName);
    nextRecords = addCompatibilityModelPair(nextRecords, fastId, baseId, baseName);
  }
  return nextRecords;
};

const normalizeSdkModelRecords = (models) => {
  if (!Array.isArray(models) || models.length === 0) {
    return fallbackModelRecords();
  }

  const entries = [];
  for (const model of models) {
    if (!isPlainObject(model)) continue;
    const id = trimString(model.id);
    if (!id) continue;
    entries.push([
      id,
      {
        id,
        name: trimString(model.displayName) || trimString(model.name) || id,
        ...(trimString(model.description) ? { description: trimString(model.description) } : {}),
      },
    ]);
  }

  return entries.length > 0 ? addCompatibilityModelPairs(Object.fromEntries(entries)) : fallbackModelRecords();
};

const buildVirtualProvider = (models) => ({
  id: CURSOR_PROVIDER_ID,
  name: 'Cursor',
  models,
});

const extractPromptPayload = (body) => {
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  const textParts = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => isPlainObject(part) && part.type === 'text')
    .map(({ part, index }) => ({
      index,
      text: trimString(part.text),
      synthetic: part.synthetic === true,
    }))
    .filter((part) => part.text);
  const planInstructionParts = textParts.filter((part) => (
    part.synthetic && part.text.trimStart().startsWith(PLAN_MODE_INSTRUCTION_PREFIX)
  ));
  const isPlanModePrompt = planInstructionParts.length > 0;
  const executionParts = isPlanModePrompt
    ? [
        ...planInstructionParts,
        ...textParts.filter((part) => !planInstructionParts.some((planPart) => planPart.index === part.index)),
      ]
    : textParts;
  const executionText = executionParts
    .map((part) => part.text)
    .join('\n\n')
    .trim();
  const visibleText = textParts
    .filter((part) => !part.synthetic)
    .map((part) => part.text)
    .join('\n\n')
    .trim();
  return {
    executionText,
    visibleText: visibleText || executionText,
    isPlanModePrompt,
    planInstructionParts,
  };
};

const normalizeModelId = (value) => {
  const raw = trimString(value);
  if (!raw) return 'auto';
  return raw.startsWith(`${CURSOR_PROVIDER_ID}/`) ? raw.slice(CURSOR_PROVIDER_ID.length + 1) : raw;
};

const normalizeRuntimeToolName = (value) => {
  const raw = trimString(value);
  if (!raw) return '';
  let normalized = raw.replace(/:\d+$/, '');
  if (normalized.includes('.')) {
    const parts = normalized.split('.').filter(Boolean);
    normalized = parts[parts.length - 1] || normalized;
  }
  normalized = normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .replace(/_?tool_?call$/, '');

  if (normalized === 'shell' || normalized === 'cmd' || normalized === 'terminal' || normalized === 'shell_command') {
    return 'bash';
  }
  if (normalized === 'write_file') return 'write';
  if (normalized === 'file_write') return 'file_write';
  if (normalized === 'create_file') return 'create';
  if (normalized === 'edit_file' || normalized === 'file_edit') return 'edit';
  if (normalized === 'applypatch' || normalized === 'patch' || normalized === 'apply_diff' || normalized === 'file_patch') {
    return 'apply_patch';
  }
  return normalized;
};

const isWorkspaceMutationCandidateTool = (toolName) => {
  const normalized = normalizeRuntimeToolName(toolName);
  return normalized === 'bash'
    || normalized === 'edit'
    || normalized === 'multiedit'
    || normalized === 'write'
    || normalized === 'create'
    || normalized === 'file_write'
    || normalized === 'apply_patch'
    || normalized === 'str_replace'
    || normalized === 'str_replace_based_edit_tool';
};

const isCursorPlanTool = (toolName) => {
  const normalized = normalizeRuntimeToolName(toolName);
  return normalized === 'create_plan';
};

const getCursorPlanToolText = (part) => {
  if (!isPlainObject(part) || !isCursorPlanTool(part.tool)) return '';
  const candidates = [
    part.input,
    part.state?.input,
    part.metadata,
    part.state?.metadata,
  ];
  for (const candidate of candidates) {
    if (!isPlainObject(candidate)) continue;
    const plan = trimString(candidate.plan);
    if (plan) return plan;
  }
  return '';
};

const readJsonFile = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : fallback;
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};

const writeJsonFile = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
};

const normalizeStoredSessionState = (state) => {
  const records = Array.isArray(state?.records) ? state.records : [];
  if (records.length === 0) {
    return {
      state: { ...state, records },
      changed: !Array.isArray(state?.records),
    };
  }

  const messageIDs = new Set(records.map((record) => trimString(record?.info?.id)).filter(Boolean));
    let changed = false;
    const nextRecords = records.map((record) => {
      if (!isPlainObject(record?.info)) return record;

      let info = record.info;
      let parts = Array.isArray(record.parts) ? record.parts : [];
      let recordChanged = !Array.isArray(record.parts);
      const repairedParts = parts.map((part) => {
        const result = mergeToolDataIntoState(part);
        if (result.changed) recordChanged = true;
        return result.part;
      });
      parts = repairedParts;

    const messageID = trimString(info.id);
    if (info.role === 'assistant' && !trimString(info.parentID) && messageID.endsWith('_assistant')) {
      const parentID = messageID.slice(0, -'_assistant'.length);
      if (messageIDs.has(parentID)) {
        info = { ...info, parentID };
        recordChanged = true;
      }
    }

    const completed = info?.time?.completed;
    if (info.role === 'assistant' && trimString(info.finish) && typeof completed === 'number') {
      const finalStatus = finishToToolStatus(info.finish);
      const nextParts = parts.map((part) => {
        if (part?.type !== 'tool' || part?.state?.status !== 'running') return part;
        recordChanged = true;
        return {
          ...part,
          state: {
            ...part.state,
            status: finalStatus,
            time: {
              ...(part.state?.time || {}),
              end: completed,
            },
          },
        };
      });
      parts = nextParts;
    }

    if (!recordChanged) return record;
    changed = true;
    return { ...record, info, parts };
  });

  return {
    state: changed ? { ...state, records: nextRecords } : { ...state, records },
    changed,
  };
};

const defaultStorageDir = () => path.join(
  process.env.OPENCHAMBER_DATA_DIR ? path.resolve(process.env.OPENCHAMBER_DATA_DIR) : path.join(os.homedir(), '.config', 'openchamber'),
  'cursor-sdk-sessions',
);

export function createCursorSdkRuntime(options = {}) {
  const readAuth = typeof options.readAuth === 'function' ? options.readAuth : () => ({});
  const env = isPlainObject(options.env) ? options.env : process.env;
  const storageDir = trimString(options.storageDir) || defaultStorageDir();
  const loadSdk = typeof options.loadSdk === 'function' ? options.loadSdk : () => importRuntimeModule('@cursor/sdk');
  const nodeBinary = trimString(options.nodeBinary) || trimString(process.env.NODE_BINARY) || 'node';
  const useNodeWorkerForPrompts = options.useNodeWorkerForPrompts ?? (isBunRuntime() && typeof options.loadSdk !== 'function');
  let workerPath = trimString(options.workerPath);
  if (!workerPath && useNodeWorkerForPrompts) {
    workerPath = fileURLToPath(new URL('./node-worker.mjs', import.meta.url));
  }
  const getWorkspaceDiff = typeof options.getWorkspaceDiff === 'function' ? options.getWorkspaceDiff : defaultGetWorkspaceDiff;
  const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
  const logger = options.logger || console;
  const streamIdleTimeoutMs = Math.max(0, Number(options.streamIdleTimeoutMs) || 45000);
  const finalResultWaitTimeoutMs = Math.max(0, Number(options.finalResultWaitTimeoutMs) || 1000);
  const activeRuns = new Map();
  const sessionStatuses = new Map();
  const agentsBySession = new Map();
  let lastModelRecords = fallbackModelRecords();
  let lastModelsSource = 'fallback';
  let lastError = null;

  const getSessionPath = (sessionID) => path.join(storageDir, `${encodeURIComponent(sessionID)}.json`);

  const readSessionState = async (sessionID) => {
    const state = await readJsonFile(getSessionPath(sessionID), {
    sessionID,
    agentID: null,
    records: [],
    });
    return normalizeStoredSessionState(state).state;
  };

  const writeSessionState = async (sessionID, state) => writeJsonFile(getSessionPath(sessionID), state);

  const appendOrReplaceRecord = async (sessionID, record) => {
    const state = await readSessionState(sessionID);
    const records = Array.isArray(state.records) ? state.records : [];
    const index = records.findIndex((entry) => entry?.info?.id === record.info.id);
    const nextRecords = index >= 0 ? [...records] : [...records, record];
    if (index >= 0) nextRecords[index] = record;
    nextRecords.sort((left, right) => String(left?.info?.id || '').localeCompare(String(right?.info?.id || '')));
    const nextState = { ...state, records: nextRecords };
    await writeSessionState(sessionID, nextState);
    return nextState;
  };

  const updateAgentId = async (sessionID, agentID) => {
    const state = await readSessionState(sessionID);
    if (state.agentID === agentID) return;
    await writeSessionState(sessionID, { ...state, agentID });
  };

  const emit = (payload, directory) => {
    emitEvent(payload, {
      directory: trimString(directory) || undefined,
      eventId: createId('evt'),
    });
  };

  const getStatus = () => {
    const auth = readAuth();
    const sdkAuthConfigured = Boolean(getCursorSdkApiKey({ env, readAuth }));
    return {
      providerId: CURSOR_PROVIDER_ID,
      bridge: { kind: 'cursor-sdk' },
      sdkAuthConfigured,
      usageAuthConfigured: isCursorUsageAuthConfigured(auth),
      activeRuns: activeRuns.size,
      modelsSource: lastModelsSource,
      modelCount: Object.keys(lastModelRecords).length,
      lastError,
    };
  };

  const getSessionStatus = () => {
    const statuses = {};
    for (const [sessionID, status] of sessionStatuses) {
      statuses[sessionID] = status;
    }
    for (const sessionID of activeRuns.keys()) {
      statuses[sessionID] = { type: 'busy' };
    }
    return statuses;
  };

  const discoverModels = async () => {
    const apiKey = getCursorSdkApiKey({ env, readAuth });
    if (!apiKey) {
      lastModelRecords = fallbackModelRecords();
      lastModelsSource = 'fallback';
      return lastModelRecords;
    }

    try {
      const { Cursor } = await loadSdk();
      const models = await Cursor.models.list({ apiKey });
      lastModelRecords = normalizeSdkModelRecords(models);
      lastModelsSource = 'sdk';
      lastError = null;
      return lastModelRecords;
    } catch (error) {
      lastModelRecords = fallbackModelRecords();
      lastModelsSource = 'fallback';
      lastError = error instanceof Error ? error.message : 'Failed to list Cursor models.';
      return lastModelRecords;
    }
  };

  const getOrCreateAgent = async ({ sessionID, apiKey, modelID, directory }) => {
    const cached = agentsBySession.get(sessionID);
    if (cached) return cached;

    const { Agent } = await loadSdk();
    const state = await readSessionState(sessionID);
    const local = trimString(directory) ? { cwd: directory } : {};
    const model = { id: normalizeModelId(modelID) };
    let agent = null;
    if (state.agentID) {
      try {
        agent = await Agent.resume(state.agentID, { apiKey, model, local });
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
        name: `DevRyan ${sessionID}`,
        local,
      });
    }
    agentsBySession.set(sessionID, agent);
    if (agent?.agentId) {
      await updateAgentId(sessionID, agent.agentId);
    }
    return agent;
  };

  const persistMessage = async (sessionID, record) => {
    await appendOrReplaceRecord(sessionID, record);
  };

  const createDirectPromptRun = async ({ sessionID, apiKey, modelID, prompt, directory }) => {
    const agent = await getOrCreateAgent({ sessionID, apiKey, modelID, directory });
    const run = await agent.send({ text: prompt }, { model: { id: modelID } });
    const waitPromise = typeof run.wait === 'function'
      ? run.wait()
        .then((result) => ({
          ok: true,
          result,
          finalStatus: finalStatusFromSdkStatus(sdkStatusFromRunStatus(result?.status || run.status)),
          finalText: trimString(result?.result),
        }))
        .catch((error) => ({
          ok: false,
          error,
          finalStatus: 'error',
          finalText: '',
        }))
      : null;
    return {
      async cancel() {
        if (typeof run.cancel === 'function') {
          await run.cancel();
        }
      },
      async waitFinalResult(options = {}) {
        if (!waitPromise) return null;
        return withTimeout(waitPromise, options.timeoutMs);
      },
      async *stream() {
        const iterator = run.stream()[Symbol.asyncIterator]();
        const waitEventPromise = waitPromise
          ? waitPromise.then((result) => ({ source: 'wait', result }))
          : null;

        async function* yieldWaitResult(result) {
          if (!result) return;
          if (result.ok === false) {
            throw result.error || new Error('Cursor SDK run failed.');
          }
          if (trimString(result.finalText)) {
            yield {
              type: 'message',
              message: {
                type: 'assistant',
                message: {
                  role: 'assistant',
                  content: [{ type: 'text', text: result.finalText }],
                },
              },
            };
          }
          if (result.finalStatus) {
            yield {
              type: 'message',
              message: {
                type: 'status',
                status: sdkStatusFromRunStatus(result.result?.status || run.status),
              },
            };
          }
        }

        for (;;) {
          const nextPromise = iterator.next().then((next) => ({ source: 'stream', next }));
          const event = waitEventPromise
            ? await Promise.race([nextPromise, waitEventPromise])
            : await nextPromise;

          if (event.source === 'wait') {
            nextPromise.catch(() => {});
            if (typeof iterator.return === 'function') {
              iterator.return().catch(() => {});
            }
            yield* yieldWaitResult(event.result);
            return;
          }

          if (event.next?.done) {
            break;
          }
          yield { type: 'message', message: event.next?.value };
        }

        if (waitPromise) {
          yield* yieldWaitResult(await withTimeout(waitPromise, finalResultWaitTimeoutMs));
        }
      },
    };
  };

  const createNodeWorkerPromptRun = async ({ sessionID, apiKey, modelID, prompt, directory }) => {
    const state = await readSessionState(sessionID);
    const child = spawn(nodeBinary, [workerPath], {
      cwd: path.dirname(workerPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`;
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.stdin.end(JSON.stringify({
      apiKey,
      sessionID,
      modelID,
      prompt,
      directory: trimString(directory),
      agentID: trimString(state.agentID),
    }));

    const exitPromise = new Promise((resolve) => {
      child.on('error', (error) => resolve({ code: 1, signal: null, error }));
      child.on('close', (code, signal) => resolve({ code, signal, error: null }));
    });

    return {
      async cancel() {
        if (child.exitCode !== null || child.killed) return;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            child.kill('SIGKILL');
          }
        }, 2500).unref?.();
      },
      async *stream() {
        const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
        let workerError = null;
        let completedNaturally = false;
        let sawDone = false;

        try {
          for await (const line of lines) {
            if (!trimString(line)) continue;
            let payload = null;
            try {
              payload = JSON.parse(line);
            } catch {
              continue;
            }

            if (payload?.type === 'agent' && trimString(payload.agentID)) {
              yield { type: 'agent', agentID: trimString(payload.agentID) };
            } else if (payload?.type === 'message') {
              yield { type: 'message', message: payload.message };
            } else if (payload?.type === 'done') {
              sawDone = true;
              completedNaturally = true;
              break;
            } else if (payload?.type === 'error') {
              workerError = trimString(payload.error) || 'Cursor SDK worker failed.';
            }
          }
          completedNaturally = true;
        } finally {
          if (!completedNaturally && !sawDone && child.exitCode === null && !child.killed) {
            child.kill('SIGTERM');
          }
        }

        if (completedNaturally) {
          const exit = await exitPromise;
          if (workerError) {
            throw new Error(workerError);
          }
          if (exit.error) {
            throw exit.error;
          }
          if (exit.code && exit.code !== 0) {
            const detail = trimString(stderr);
            throw new Error(detail ? `Cursor SDK worker exited with code ${exit.code}: ${detail}` : `Cursor SDK worker exited with code ${exit.code}.`);
          }
        }
      },
    };
  };

  const createPromptRun = typeof options.createPromptRun === 'function'
    ? options.createPromptRun
    : useNodeWorkerForPrompts
      ? createNodeWorkerPromptRun
      : createDirectPromptRun;

  const getWorkspaceDiffSnapshot = async (directory) => {
    try {
      return normalizeDiffSnapshot(await getWorkspaceDiff(directory));
    } catch {
      return '';
    }
  };

  const runPrompt = async ({ sessionID, body, directory }) => {
    const apiKey = getCursorSdkApiKey({ env, readAuth });
    if (!apiKey) {
      return {
        handled: true,
        status: 401,
        body: { error: 'Cursor SDK API key is not configured.' },
      };
    }

    const {
      executionText: prompt,
      visibleText,
      isPlanModePrompt,
      planInstructionParts,
    } = extractPromptPayload(body);
    if (!prompt) {
      return {
        handled: true,
        status: 400,
        body: { error: 'Cursor prompts require at least one text part.' },
      };
    }

    const modelID = normalizeModelId(body?.model?.modelID);
    const userMessageID = trimString(body?.messageID) || createId('msg');
    const assistantMessageID = createAssistantMessageId(userMessageID);
    const created = now();
    let partSequence = 0;
    let syntheticPatchPartID = null;
    const toolPartIdsByCallId = new Map();
    const nextPartID = (kind, suffix = '') => {
      partSequence += 1;
      const sequence = String(partSequence).padStart(6, '0');
      return `${assistantMessageID}_part_${sequence}_${kind}${suffix ? `_${suffix}` : ''}`;
    };
    const ensureSyntheticPatchPartID = () => {
      if (!syntheticPatchPartID) {
        syntheticPatchPartID = nextPartID('tool', 'synthetic_workspace_patch');
      }
      return syntheticPatchPartID;
    };
    const getToolPartID = (callID) => {
      const normalizedCallID = trimString(callID) || createId('call');
      const existing = toolPartIdsByCallId.get(normalizedCallID);
      if (existing) return existing;
      const partID = nextPartID('tool', normalizedCallID);
      toolPartIdsByCallId.set(normalizedCallID, partID);
      return partID;
    };
    const requestedAgent = trimString(body?.agent);
    const baselineWorkspaceDiff = await getWorkspaceDiffSnapshot(directory);
    let lastSyntheticWorkspaceDiff = baselineWorkspaceDiff;
    const userParts = [{
      id: `${userMessageID}_text`,
      sessionID,
      messageID: userMessageID,
      type: 'text',
      text: visibleText,
    }];
    if (isPlanModePrompt) {
      for (const [index, part] of planInstructionParts.entries()) {
        userParts.push({
          id: `${userMessageID}_plan_mode_${String(index + 1).padStart(2, '0')}`,
          sessionID,
          messageID: userMessageID,
          type: 'text',
          text: part.text,
          synthetic: true,
        });
      }
    }

    const userRecord = {
      info: {
        id: userMessageID,
        sessionID,
        role: 'user',
        time: { created },
        providerID: CURSOR_PROVIDER_ID,
        modelID,
        ...(requestedAgent ? { agent: requestedAgent } : {}),
        ...(isPlanModePrompt ? { metadata: { openchamberPlanMode: true } } : {}),
      },
      parts: userParts,
    };

    const assistantRecord = {
      info: {
        id: assistantMessageID,
        parentID: userMessageID,
        sessionID,
        role: 'assistant',
        time: { created: created + 1 },
        providerID: CURSOR_PROVIDER_ID,
        modelID,
        ...(requestedAgent ? { agent: requestedAgent, mode: requestedAgent } : {}),
      },
      parts: [],
    };

    const emittedMessageInfo = new Map();
    const emittedParts = new Map();
    const rawAssistantTextByPartId = new Map();
    const planTextPartIdsByToolPartId = new Map();

    const normalizeAssistantPlanParts = () => {
      if (!isPlanModePrompt) return false;
      const normalizedParts = normalizePlanModeAssistantParts(assistantRecord.parts, { isPlanModePrompt: true });
      if (normalizedParts === assistantRecord.parts || areRuntimeValuesEqual(normalizedParts, assistantRecord.parts)) {
        return false;
      }
      assistantRecord.parts = normalizedParts;
      return true;
    };

    const upsertAssistantPlanTextFromToolPart = (toolPart) => {
      if (!isPlanModePrompt) return false;
      const planText = getCursorPlanToolText(toolPart);
      if (!planText) return false;

      let partID = planTextPartIdsByToolPartId.get(toolPart.id);
      if (!partID) {
        partID = nextPartID('text', 'cursor_plan');
        planTextPartIdsByToolPartId.set(toolPart.id, partID);
      }

      const existing = assistantRecord.parts.find((part) => part.id === partID);
      const existingText = rawAssistantTextByPartId.get(partID) || existing?.text || '';
      if (existing && existingText === planText) {
        return normalizeAssistantPlanParts();
      }

      rawAssistantTextByPartId.set(partID, planText);
      const partChanged = upsertAssistantPart({
        ...(existing || {
          id: partID,
          sessionID,
          messageID: assistantMessageID,
          type: 'text',
          time: { start: now() },
        }),
        text: planText,
      });
      const normalizedChanged = normalizeAssistantPlanParts();
      return partChanged || normalizedChanged;
    };

    const emitRecordDelta = async (record) => {
      await persistMessage(sessionID, record);

      const previousInfo = emittedMessageInfo.get(record.info.id);
      if (!previousInfo || !areRuntimeValuesEqual(previousInfo, record.info)) {
        emittedMessageInfo.set(record.info.id, record.info);
        emit({ type: 'message.updated', properties: { info: record.info } }, directory);
      }

      const currentPartIds = new Set();
      for (const part of record.parts || []) {
        if (!part?.id) continue;
        currentPartIds.add(part.id);
        const previousPart = emittedParts.get(part.id);
        if (previousPart && areRuntimeValuesEqual(previousPart, part)) {
          continue;
        }
        emittedParts.set(part.id, part);
        emit({ type: 'message.part.updated', properties: { part } }, directory);
      }

      for (const [partID, part] of [...emittedParts.entries()]) {
        if (part?.messageID !== record.info.id || currentPartIds.has(partID)) {
          continue;
        }
        emittedParts.delete(partID);
        emit({
          type: 'message.part.removed',
          properties: {
            messageID: record.info.id,
            partID,
          },
        }, directory);
      }
    };

    const upsertAssistantPart = (part) => {
      const existingIndex = assistantRecord.parts.findIndex((existing) => existing.id === part.id);
      if (existingIndex >= 0) {
        const existing = assistantRecord.parts[existingIndex];
        if (areRuntimeValuesEqual(existing, part)) {
          return false;
        }
        assistantRecord.parts = assistantRecord.parts.map((existing, index) => (
          index === existingIndex ? part : existing
        ));
        return true;
      }

      assistantRecord.parts = [...assistantRecord.parts, part];
      return true;
    };

    const syncUserRecordDiffSummary = async (files) => {
      const summary = buildWorkspaceDiffSummary(files);
      if (!summary) {
        if (!hasOwn(userRecord.info, 'summary')) {
          return false;
        }
        const { summary: _summary, ...nextInfo } = userRecord.info;
        void _summary;
        userRecord.info = nextInfo;
        await emitRecordDelta(userRecord);
        return true;
      }

      if (areRuntimeValuesEqual(userRecord.info.summary, summary)) {
        return false;
      }

      userRecord.info = {
        ...userRecord.info,
        summary,
      };
      await emitRecordDelta(userRecord);
      return true;
    };

    const syncWorkspacePatchPart = async (completed = now()) => {
      const currentWorkspaceDiff = await getWorkspaceDiffSnapshot(directory);
      if (currentWorkspaceDiff === lastSyntheticWorkspaceDiff) {
        return false;
      }
      lastSyntheticWorkspaceDiff = currentWorkspaceDiff;

      if (!currentWorkspaceDiff || currentWorkspaceDiff === baselineWorkspaceDiff) {
        const summaryChanged = await syncUserRecordDiffSummary([]);
        if (!syntheticPatchPartID) {
          return summaryChanged;
        }
        const nextParts = assistantRecord.parts.filter((part) => part.id !== syntheticPatchPartID);
        if (nextParts.length === assistantRecord.parts.length) {
          return summaryChanged;
        }
        assistantRecord.parts = nextParts;
        await emitRecordDelta(assistantRecord);
        return true;
      }

      const files = parseUnifiedDiffFiles(currentWorkspaceDiff);
      if (files.length === 0) {
        return syncUserRecordDiffSummary([]);
      }
      await syncUserRecordDiffSummary(files);

      const output = `Applied ${files.length} ${files.length === 1 ? 'patch' : 'patches'}.`;
      const patchPartID = ensureSyntheticPatchPartID();
      const patchPart = {
        id: patchPartID,
        sessionID,
        messageID: assistantMessageID,
        type: 'tool',
        tool: 'apply_patch',
        input: { patchText: currentWorkspaceDiff },
        output,
        state: {
          status: 'completed',
          input: { patchText: currentWorkspaceDiff },
          output,
          metadata: {
            patchText: currentWorkspaceDiff,
            files,
          },
          time: {
            start: created,
            end: completed,
          },
        },
      };
      assistantRecord.parts = [
        ...assistantRecord.parts.filter((part) => part.id !== patchPartID),
        patchPart,
      ];
      await emitRecordDelta(assistantRecord);
      return true;
    };

    const applyFinalAssistantText = (text) => {
      const finalText = trimString(text);
      if (!finalText) return false;

      const textParts = assistantRecord.parts.filter((part) => part?.type === 'text');
      const getComparableText = (part) => (
        rawAssistantTextByPartId.get(part?.id) || (typeof part?.text === 'string' ? part.text : '')
      );
      const combinedText = textParts
        .map((part) => getComparableText(part))
        .join('');
      const combinedTextWithBreaks = textParts
        .map((part) => getComparableText(part))
        .filter(Boolean)
        .join('\n');
      if (
        combinedText === finalText
        || combinedTextWithBreaks === finalText
        || combinedText.includes(finalText)
        || combinedTextWithBreaks.includes(finalText)
      ) {
        return false;
      }

      const textPart = textParts[textParts.length - 1] || null;
      const existingText = getComparableText(textPart);
      const enrichedFinalText = combinedText && finalText.startsWith(combinedText)
        ? `${existingText}${finalText.slice(combinedText.length)}`
        : combinedTextWithBreaks && finalText.startsWith(combinedTextWithBreaks)
          ? `${existingText}${finalText.slice(combinedTextWithBreaks.length)}`
          : finalText;
      const nextText = mergeFinalText(existingText, enrichedFinalText);
      if (nextText === existingText) return false;

      const nextPartId = textPart?.id || nextPartID('text');
      rawAssistantTextByPartId.set(nextPartId, nextText);
      const partChanged = upsertAssistantPart({
        ...(textPart || {
          id: nextPartId,
          sessionID,
          messageID: assistantMessageID,
          type: 'text',
          time: { start: now() },
        }),
        text: nextText,
      });
      const normalizedChanged = normalizeAssistantPlanParts();
      if (!partChanged && !normalizedChanged) {
        return false;
      }
      return true;
    };

    const waitForFinalRunResult = async (timeoutMs = finalResultWaitTimeoutMs) => {
      if (!run || typeof run.waitFinalResult !== 'function') return null;
      const result = await run.waitFinalResult({ timeoutMs });
      if (!result) return null;
      if (result.ok === false) {
        throw result.error || new Error('Cursor SDK run failed.');
      }
      return result;
    };

    const applyFinalRunResult = (result) => {
      if (!result) return null;
      applyFinalAssistantText(result.finalText);
      return result.finalStatus || null;
    };

    const finalizeAssistantRun = async (finalStatus, completed = now()) => {
      const finish = normalizeFinish(finalStatus);
      if (finish === 'stop') {
        await syncWorkspacePatchPart(completed);
      }

      const finalToolStatus = finishToToolStatus(finish);
      assistantRecord.parts = assistantRecord.parts.map((part) => {
        if (part?.type === 'tool') {
          if (part?.state?.status !== 'running' && part?.state?.status !== 'pending') return part;
          return {
            ...part,
            state: {
              ...part.state,
              status: finalToolStatus,
              time: {
                ...(part.state?.time || {}),
                end: completed,
              },
            },
          };
        }

        if (part?.type === 'reasoning') {
          const text = typeof part.text === 'string' ? part.text : '';
          const trimmedText = trimDanglingReasoningFragment(text);
          if (trimmedText !== text || typeof part?.time?.end !== 'number') {
            return {
              ...part,
              text: trimmedText,
              time: {
                ...(part.time || {}),
                end: completed,
              },
            };
          }
        }

        if (part?.type === 'text' && typeof part?.time?.end !== 'number') {
          return {
            ...part,
            time: {
              ...(part.time || {}),
              end: completed,
            },
          };
        }

        return part;
      });
      normalizeAssistantPlanParts();
      assistantRecord.info = {
        ...assistantRecord.info,
        finish,
        time: {
          ...assistantRecord.info.time,
          completed,
        },
      };
      await emitRecordDelta(assistantRecord);
      sessionStatuses.set(sessionID, { type: 'idle' });
      emit({ type: 'session.status', properties: { sessionID, status: { type: 'idle' } } }, directory);
    };

    await emitRecordDelta(userRecord);
    await emitRecordDelta(assistantRecord);
    sessionStatuses.set(sessionID, { type: 'busy' });
    emit({ type: 'session.status', properties: { sessionID, status: { type: 'busy' } } }, directory);

    let run = null;
    try {
      run = await createPromptRun({ sessionID, apiKey, modelID, prompt, directory });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Cursor SDK run failed.';
      applyFinalAssistantText(`Cursor SDK error: ${text}`);
      lastError = text;
      await finalizeAssistantRun('error');
      return {
        handled: true,
        status: 204,
        body: null,
      };
    }
    activeRuns.set(sessionID, { run, assistantMessageID, directory });

    const pump = (async () => {
      let finalStatus = 'success';
      const shouldFinishOnIdle = () => {
        const assistantText = assistantRecord.parts
          .filter((part) => part?.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
          .trim();
        const hasRunningTool = assistantRecord.parts.some((part) => (
          part?.type === 'tool' && (part?.state?.status === 'running' || part?.state?.status === 'pending')
        ));
        const hasCompletedTool = assistantRecord.parts.some((part) => (
          part?.type === 'tool' && part?.state?.status && part.state.status !== 'running' && part.state.status !== 'pending'
        ));
        return !hasRunningTool && (assistantText.length > 0 || hasCompletedTool);
      };

      const readNextStreamEvent = async (iterator) => {
        const nextPromise = iterator.next();
        if (!streamIdleTimeoutMs || !shouldFinishOnIdle()) {
          return { next: await nextPromise, idle: false };
        }

        let timeout = null;
        const idlePromise = new Promise((resolve) => {
          timeout = setTimeout(() => resolve({ next: null, idle: true }), streamIdleTimeoutMs);
          timeout.unref?.();
        });
        const result = await Promise.race([
          nextPromise.then((next) => ({ next, idle: false })),
          idlePromise,
        ]);
        if (timeout) clearTimeout(timeout);
        if (result.idle) {
          nextPromise.catch(() => {});
        }
        return result;
      };

      try {
        const iterator = run.stream()[Symbol.asyncIterator]();
        let activeTextPartID = null;
        let activeReasoningPartID = null;
        let previousContentKind = null;
        for (;;) {
          const { next, idle } = await readNextStreamEvent(iterator);
          if (idle) {
            const result = await waitForFinalRunResult(finalResultWaitTimeoutMs);
            finalStatus = applyFinalRunResult(result) || 'success';
            if (typeof iterator.return === 'function') {
              iterator.return().catch(() => {});
            }
            break;
          }
          if (next?.done) break;
          const event = next?.value;
          if (event?.type === 'agent') {
            await updateAgentId(sessionID, event.agentID);
            continue;
          }
          const message = event?.type === 'message' ? event.message : event;
          if (!isPlainObject(message)) continue;
          if (message.type === 'assistant') {
            const content = Array.isArray(message.message?.content) ? message.message.content : [];
            const text = content
              .filter((block) => block?.type === 'text' && typeof block.text === 'string')
              .map((block) => block.text)
              .join('');
            if (text) {
              if (previousContentKind !== 'assistant' || !activeTextPartID) {
                activeTextPartID = nextPartID('text');
              }
              const existing = assistantRecord.parts.find((part) => part.id === activeTextPartID);
              const existingText = rawAssistantTextByPartId.get(activeTextPartID) || existing?.text || '';
              const nextText = mergeTextDelta(existingText, text);
              rawAssistantTextByPartId.set(activeTextPartID, nextText);
              const partChanged = upsertAssistantPart({
                ...(existing || {
                  id: activeTextPartID,
                  sessionID,
                  messageID: assistantMessageID,
                  type: 'text',
                  time: { start: now() },
                }),
                text: nextText,
              });
              previousContentKind = 'assistant';
              const normalizedChanged = partChanged ? normalizeAssistantPlanParts() : false;
              if (partChanged || normalizedChanged) {
                await emitRecordDelta(assistantRecord);
              }
            }
          } else if (message.type === 'thinking') {
            const text = typeof message.text === 'string' ? message.text : '';
            if (text) {
              if (previousContentKind !== 'thinking' || !activeReasoningPartID) {
                activeReasoningPartID = nextPartID('reasoning');
              }
              const existing = assistantRecord.parts.find((part) => part.id === activeReasoningPartID);
              const existingText = typeof existing?.text === 'string' ? existing.text : '';
              const reasoningPart = {
                ...(existing || {
                  id: activeReasoningPartID,
                  sessionID,
                  messageID: assistantMessageID,
                  type: 'reasoning',
                  time: { start: now() },
                }),
                text: mergeTextDelta(existingText, text),
              };
              const partChanged = upsertAssistantPart(reasoningPart);
              previousContentKind = 'thinking';
              if (partChanged) {
                await emitRecordDelta(assistantRecord);
              }
            }
          } else if (message.type === 'tool_call') {
            const partID = getToolPartID(message.call_id);
            const existing = assistantRecord.parts.find((part) => part.id === partID);
            const status = normalizeToolCallStatus(message.status);
            const startedAt = existing?.state?.time?.start || now();
            const input = isPlainObject(message.args) ? message.args : undefined;
            const output = safeJson(message.result);
            const metadata = isPlainObject(message.metadata) ? message.metadata : undefined;
            const toolPart = {
              id: partID,
              sessionID,
              messageID: assistantMessageID,
              type: 'tool',
              tool: trimString(message.name) || 'tool',
              ...(input ? { input } : {}),
              output,
              state: {
                status,
                ...(input ? { input } : {}),
                output,
                ...(metadata ? { metadata } : {}),
                time: {
                  start: startedAt,
                  ...(status !== 'running' && status !== 'pending' ? { end: now() } : {}),
                },
              },
            };
            const partChanged = upsertAssistantPart(toolPart);
            const isTerminalToolStatus = status !== 'running' && status !== 'pending';
            const planTextChanged = isTerminalToolStatus
              ? upsertAssistantPlanTextFromToolPart(toolPart)
              : false;
            previousContentKind = 'tool';
            if (partChanged || planTextChanged) {
              await emitRecordDelta(assistantRecord);
            }
            if (isTerminalToolStatus && isWorkspaceMutationCandidateTool(message.name)) {
              await syncWorkspacePatchPart();
            }
          } else if (message.type === 'status') {
            const terminalStatus = finalStatusFromSdkStatus(message.status);
            if (terminalStatus) {
              const result = await waitForFinalRunResult(finalResultWaitTimeoutMs);
              applyFinalRunResult(result);
              finalStatus = terminalStatus;
              break;
            }
          }
        }
        const result = await waitForFinalRunResult(finalResultWaitTimeoutMs);
        finalStatus = applyFinalRunResult(result) || finalStatus;
      } catch (error) {
        finalStatus = 'error';
        const text = error instanceof Error ? error.message : 'Cursor SDK run failed.';
        const hasAssistantText = assistantRecord.parts.some((part) => (
          part?.type === 'text' && trimString(part.text)
        ));
        if (!hasAssistantText) {
          applyFinalAssistantText(`Cursor SDK error: ${text}`);
        }
        lastError = text;
      } finally {
        activeRuns.delete(sessionID);
        await finalizeAssistantRun(finalStatus);
      }
    })();

    pump.catch((error) => {
      lastError = error instanceof Error ? error.message : 'Cursor SDK stream failed.';
      logger.error?.('[CursorSDK] stream failed:', error);
    });

    return {
      handled: true,
      status: 204,
      body: null,
    };
  };

  return {
    getRuntimeStatus: getStatus,
    getSessionStatus,
    async verifyConnection() {
      const apiKey = getCursorSdkApiKey({ env, readAuth });
      if (!apiKey) {
        return {
          ...getStatus(),
          ok: false,
          configured: false,
          error: 'Cursor SDK API key is not configured.',
        };
      }

      try {
        const { Cursor } = await loadSdk();
        await Cursor.me({ apiKey });
        const models = await discoverModels();
        return {
          ...getStatus(),
          ok: true,
          configured: true,
          modelCount: Object.keys(models).length,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Cursor SDK connection failed.';
        return {
          ...getStatus(),
          ok: false,
          configured: true,
          error: lastError,
        };
      }
    },
    async getVirtualProvider() {
      const models = await discoverModels();
      return buildVirtualProvider(models);
    },
    async handlePromptAsync(input) {
      const providerID = trimString(input?.body?.model?.providerID);
      if (providerID !== CURSOR_PROVIDER_ID) {
        return { handled: false };
      }
      return runPrompt(input);
    },
    async abortSession(sessionID) {
      const active = activeRuns.get(sessionID);
      if (!active?.run || typeof active.run.cancel !== 'function') {
        return false;
      }
      await active.run.cancel();
      activeRuns.delete(sessionID);
      sessionStatuses.set(sessionID, { type: 'idle' });
      emit({ type: 'session.status', properties: { sessionID, status: { type: 'idle' } } }, active.directory);
      return true;
    },
    async getSessionMessages(sessionID) {
      const state = await readSessionState(sessionID);
      return Array.isArray(state.records) ? state.records : [];
    },
  };
}
