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

const CURSOR_MODEL_PARAM_FAST = 'fast';
const CURSOR_MODEL_PARAM_THINKING = 'thinking';
const CURSOR_MODEL_PARAM_REASONING = 'reasoning';
const CURSOR_MODEL_PARAM_EFFORT = 'effort';
const CURSOR_MODEL_PARAM_CONTEXT = 'context';
const CURSOR_MODEL_TRUE_VALUE = 'true';

const CURSOR_MODEL_EFFORT_ALIASES = new Map([
  ['none', 'none'],
  ['minimal', 'minimal'],
  ['min', 'minimal'],
  ['low', 'low'],
  ['medium', 'medium'],
  ['high', 'high'],
  ['xhigh', 'extra-high'],
  ['extra-high', 'extra-high'],
  ['max', 'max'],
]);

const CURSOR_MODEL_EFFORT_DEFAULT_SCORES = new Map([
  ['medium', 50],
  ['high', 45],
  ['low', 40],
  ['extra-high', 35],
  ['max', 30],
  ['minimal', 20],
  ['none', 10],
]);

const createCursorModelCapabilities = () => ({
  attachment: true,
  input: {
    text: true,
    audio: false,
    image: true,
    video: false,
    pdf: false,
  },
  output: {
    text: true,
    audio: false,
    image: false,
    video: false,
    pdf: false,
  },
});

const now = () => Date.now();

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const importRuntimeModule = (specifier) => {
  const importer = new Function('specifier', 'return import(specifier)');
  return importer(specifier);
};

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const escapeXmlAttribute = (value) => trimString(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

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

const isDesktopRuntimeEnv = (env) => trimString(env?.OPENCHAMBER_RUNTIME).toLowerCase() === 'desktop';

const normalizeWorkerEnv = (value) => {
  if (!isPlainObject(value)) return {};
  const normalized = {};
  for (const [key, entry] of Object.entries(value)) {
    const envKey = trimString(key);
    if (!envKey || entry === undefined || entry === null) continue;
    normalized[envKey] = String(entry);
  }
  return normalized;
};

export const resolveCursorSdkWorkerRuntimeConfig = ({
  env = process.env,
  hasInjectedLoadSdk = false,
  isBunRuntime: bunRuntime = isBunRuntime(),
  isElectronRuntime = Boolean(process.versions?.electron),
  execPath = process.execPath,
  resourcesPath = process.resourcesPath,
  nodeBinaryEnv = process.env.NODE_BINARY,
  requestedNodeBinary = '',
  requestedUseNodeWorkerForPrompts,
  requestedWorkerCwd = '',
  requestedWorkerEnv,
  workerPath = '',
} = {}) => {
  const useNodeWorkerForPrompts = typeof requestedUseNodeWorkerForPrompts === 'boolean'
    ? requestedUseNodeWorkerForPrompts
    : (Boolean(bunRuntime) || isDesktopRuntimeEnv(env)) && !hasInjectedLoadSdk;
  const nodeBinary = trimString(requestedNodeBinary)
    || trimString(nodeBinaryEnv)
    || (isElectronRuntime ? trimString(execPath) : '')
    || 'node';
  const defaultWorkerEnv = isElectronRuntime ? { ELECTRON_RUN_AS_NODE: '1' } : {};
  const normalizedWorkerPath = trimString(workerPath);
  const workerCwd = trimString(requestedWorkerCwd)
    || (isElectronRuntime && trimString(resourcesPath)
      ? trimString(resourcesPath)
      : normalizedWorkerPath
        ? path.dirname(normalizedWorkerPath)
        : process.cwd());

  return {
    useNodeWorkerForPrompts,
    nodeBinary,
    workerCwd,
    workerEnv: {
      ...defaultWorkerEnv,
      ...normalizeWorkerEnv(requestedWorkerEnv),
    },
  };
};

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

const firstStringValue = (...candidates) => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }
  return '';
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

export const computeIncrementalTextDelta = (previousText, nextText) => {
  const previous = typeof previousText === 'string' ? previousText : '';
  const next = typeof nextText === 'string' ? nextText : '';
  if (!next || next === previous) return '';
  if (next.length > previous.length && next.startsWith(previous)) {
    return next.slice(previous.length);
  }
  return null;
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

const DANGLING_REASONING_LIST_MARKER_PATTERN = /(?:\n\s*)+(?:[-*]|\d+[.)])\s*$/;
const SENTENCE_BOUNDARY_PATTERN = /[.!?][)"'\]]?(?=\s|$)/g;
const TOOL_ONLY_COMPLETION_SUMMARY = 'Completed the requested work. See the tool activity above for details.';

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

const createAsyncQueue = () => {
  const values = [];
  const waiters = [];
  let closed = false;

  return {
    push(value) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ done: false, value });
        return;
      }
      values.push(value);
    },
    close() {
      if (closed) return;
      closed = true;
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.({ done: true, value: undefined });
      }
    },
    next() {
      if (values.length > 0) {
        return Promise.resolve({ done: false, value: values.shift() });
      }
      if (closed) {
        return Promise.resolve({ done: true, value: undefined });
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  };
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

const createCursorModelRecord = ({ id, name, description, options, variants }) => ({
  id,
  name,
  ...(trimString(description) ? { description: trimString(description) } : {}),
  ...(isPlainObject(options) && Object.keys(options).length > 0 ? { options } : {}),
  ...(isPlainObject(variants) && Object.keys(variants).length > 0 ? { variants } : {}),
  capabilities: createCursorModelCapabilities(),
});

const fallbackModelRecords = () => Object.fromEntries(
  FALLBACK_MODELS.map(([id, name]) => [id, createCursorModelRecord({ id, name })]),
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

const createCursorSdkModelSelection = (id, params) => {
  const normalizedId = normalizeModelId(id);
  const normalizedParams = normalizeModelSelectionParams(params);
  return {
    id: normalizedId,
    ...(normalizedParams.length > 0 ? { params: normalizedParams } : {}),
  };
};

const cloneCursorSdkModelSelection = (selection) => {
  if (!isPlainObject(selection)) return null;
  const id = normalizeModelId(selection.id);
  if (!id) return null;
  return createCursorSdkModelSelection(id, selection.params);
};

const getModelParamValue = (params, id) => {
  const normalizedId = trimString(id);
  if (!normalizedId) return '';
  for (const param of normalizeModelSelectionParams(params)) {
    if (param.id === normalizedId) return param.value;
  }
  return '';
};

const normalizeCursorModelEffort = (value) => (
  CURSOR_MODEL_EFFORT_ALIASES.get(trimString(value).toLowerCase()) || ''
);

const createCursorVariantKeyFromParams = (params) => {
  const thinkingEnabled = getModelParamValue(params, CURSOR_MODEL_PARAM_THINKING).toLowerCase() === CURSOR_MODEL_TRUE_VALUE;
  const effort = normalizeCursorModelEffort(
    getModelParamValue(params, CURSOR_MODEL_PARAM_REASONING)
    || getModelParamValue(params, CURSOR_MODEL_PARAM_EFFORT)
  );

  if (thinkingEnabled && effort) return `${CURSOR_MODEL_PARAM_THINKING}-${effort}`;
  if (thinkingEnabled) return CURSOR_MODEL_PARAM_THINKING;
  return effort || '';
};

const getParamMagnitudeScore = (value) => {
  const normalized = trimString(value).toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([km])$/);
  if (!match) return 0;
  const numeric = Number.parseFloat(match[1]);
  if (!Number.isFinite(numeric)) return 0;
  return match[2] === 'm' ? numeric * 1_000_000 : numeric * 1_000;
};

const scoreCursorSdkVariant = (sdkVariant) => {
  const params = normalizeModelSelectionParams(sdkVariant?.params);
  const effort = normalizeCursorModelEffort(
    getModelParamValue(params, CURSOR_MODEL_PARAM_REASONING)
    || getModelParamValue(params, CURSOR_MODEL_PARAM_EFFORT)
  );
  return (
    (sdkVariant?.isDefault === true ? 1_000_000_000 : 0)
    + getParamMagnitudeScore(getModelParamValue(params, CURSOR_MODEL_PARAM_CONTEXT))
    + (CURSOR_MODEL_EFFORT_DEFAULT_SCORES.get(effort) || 0)
  );
};

const mergeCursorSdkModelCandidate = (records, candidate) => {
  const id = trimString(candidate.id);
  if (!id) return;

  const existing = records[id];
  const variants = isPlainObject(existing?.variants) ? { ...existing.variants } : {};
  const variantKey = trimString(candidate.variantKey);
  const cursorSdkModel = createCursorSdkModelSelection(candidate.sdkModelId, candidate.params);
  const score = Number.isFinite(candidate.score) ? candidate.score : 0;

  if (variantKey) {
    const existingVariant = variants[variantKey];
    const existingScore = Number.isFinite(existingVariant?._cursorSdkScore) ? existingVariant._cursorSdkScore : -1;
    if (!existingVariant || score >= existingScore) {
      variants[variantKey] = {
        cursorSdkModel,
        _cursorSdkScore: score,
      };
    }
  }

  const existingOptions = isPlainObject(existing?.options) ? existing.options : {};
  const existingSelectionScore = Number.isFinite(existingOptions._cursorSdkScore) ? existingOptions._cursorSdkScore : -1;
  const nextOptions = score >= existingSelectionScore
    ? {
        ...existingOptions,
        cursorSdkModel,
        _cursorSdkScore: score,
      }
    : existingOptions;

  records[id] = createCursorModelRecord({
    id,
    name: trimString(candidate.name) || existing?.name || id,
    description: candidate.description ?? existing?.description,
    options: nextOptions,
    variants,
  });
};

const stripInternalCursorSdkScores = (records) => Object.fromEntries(
  Object.entries(records).map(([id, model]) => {
    if (!isPlainObject(model)) return [id, model];
    const { options: _options, variants: _variants, ...rest } = model;
    const options = isPlainObject(model.options) ? { ...model.options } : null;
    if (options) delete options._cursorSdkScore;
    const variants = isPlainObject(model.variants)
      ? Object.fromEntries(
          Object.entries(model.variants).map(([variantKey, variant]) => {
            if (!isPlainObject(variant)) return [variantKey, variant];
            const nextVariant = { ...variant };
            delete nextVariant._cursorSdkScore;
            return [variantKey, nextVariant];
          })
        )
      : null;
    return [
      id,
      {
        ...rest,
        ...(options && Object.keys(options).length > 0 ? { options } : {}),
        ...(variants && Object.keys(variants).length > 0 ? { variants } : {}),
      },
    ];
  })
);

const addSdkModelRecord = (records, model) => {
  const sdkModelId = trimString(model.id);
  if (!sdkModelId) return;
  const name = trimString(model.displayName) || trimString(model.name) || sdkModelId;
  const description = model.description;
  const variants = Array.isArray(model.variants) ? model.variants : [];

  if (variants.length === 0) {
    records[sdkModelId] = createCursorModelRecord({
      id: sdkModelId,
      name,
      description,
      options: { cursorSdkModel: createCursorSdkModelSelection(sdkModelId, []) },
    });
    return;
  }

  for (const sdkVariant of variants) {
    if (!isPlainObject(sdkVariant)) continue;
    const params = normalizeModelSelectionParams(sdkVariant.params);
    const variantKey = createCursorVariantKeyFromParams(params);
    const fastEnabled = getModelParamValue(params, CURSOR_MODEL_PARAM_FAST).toLowerCase() === CURSOR_MODEL_TRUE_VALUE;
    const targetModelId = fastEnabled ? `${sdkModelId}-fast` : sdkModelId;
    const targetName = fastEnabled && !/\bfast\b/i.test(name) ? `${name} Fast` : name;
    mergeCursorSdkModelCandidate(records, {
      id: targetModelId,
      sdkModelId,
      name: targetName,
      description,
      params,
      variantKey,
      score: scoreCursorSdkVariant(sdkVariant),
    });
  }
};

const addCompatibilityModelPair = (records, id, pairedId, pairedName) => {
  if (!records[id] || records[pairedId]) return records;
  return {
    ...records,
    [pairedId]: createCursorModelRecord({ id: pairedId, name: pairedName }),
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

  const records = {};
  for (const model of models) {
    if (!isPlainObject(model)) continue;
    const id = trimString(model.id);
    if (!id) continue;
    addSdkModelRecord(records, model);
  }

  return Object.keys(records).length > 0
    ? stripInternalCursorSdkScores(addCompatibilityModelPairs(records))
    : fallbackModelRecords();
};

const buildVirtualProvider = (models) => ({
  id: CURSOR_PROVIDER_ID,
  name: 'Cursor',
  models,
});

const resolveVariantRecord = (variants, variant) => {
  if (!isPlainObject(variants)) return null;
  const key = trimString(variant);
  if (!key) return null;
  const direct = variants[key];
  if (isPlainObject(direct)) return direct;
  const normalizedKey = createCursorVariantKeyFromParams([
    { id: CURSOR_MODEL_PARAM_THINKING, value: key.toLowerCase().includes(CURSOR_MODEL_PARAM_THINKING) ? CURSOR_MODEL_TRUE_VALUE : 'false' },
    { id: CURSOR_MODEL_PARAM_EFFORT, value: key },
  ]);
  return normalizedKey && isPlainObject(variants[normalizedKey]) ? variants[normalizedKey] : null;
};

const getCursorSdkSelectionFromModelRecord = (record, variant) => {
  if (!isPlainObject(record)) return null;
  const variantRecord = resolveVariantRecord(record.variants, variant);
  const variantSelection = cloneCursorSdkModelSelection(variantRecord?.cursorSdkModel);
  if (variantSelection) return variantSelection;
  return cloneCursorSdkModelSelection(record.options?.cursorSdkModel);
};

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

const normalizeMime = (value) => (
  typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : ''
);

const normalizeFilename = (value) => (typeof value === 'string' ? value.trim() : '');

const IMAGE_FILENAME_PATTERN = /\.(?:png|jpe?g|gif|webp|bmp|tiff?)$/i;

const isCursorImageFilePart = (part) => {
  const mime = normalizeMime(part?.mime);
  if (mime.startsWith('image/')) return true;
  return !mime && IMAGE_FILENAME_PATTERN.test(normalizeFilename(part?.filename));
};

const normalizePromptFileParts = (body, { sessionID, messageID }) => {
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  return parts
    .map((part, index) => {
      if (!isPlainObject(part) || part.type !== 'file') return null;
      const url = trimString(part.url);
      if (!url) return null;
      const mime = trimString(part.mime || part.mimeType) || 'application/octet-stream';
      const filename = normalizeFilename(part.filename || part.name);
      return {
        id: trimString(part.id) || `${messageID}_file_${String(index + 1).padStart(2, '0')}`,
        sessionID,
        messageID,
        type: 'file',
        mime,
        url,
        ...(filename ? { filename } : {}),
        ...(part.synthetic === true ? { synthetic: true } : {}),
      };
    })
    .filter(Boolean);
};

const buildCursorImages = (fileParts) => fileParts
  .filter(isCursorImageFilePart)
  .map((part) => ({ url: part.url }));

const formatUnsupportedAttachment = (part) => {
  const filename = normalizeFilename(part?.filename) || 'unnamed attachment';
  const mime = normalizeMime(part?.mime);
  return mime ? `${filename} (${mime})` : filename;
};

const getUnsupportedCursorAttachmentMessage = (fileParts) => {
  const unsupported = fileParts.filter((part) => !isCursorImageFilePart(part));
  if (unsupported.length === 0) return '';
  const shown = unsupported.slice(0, 3).map(formatUnsupportedAttachment);
  const extraCount = unsupported.length - shown.length;
  return [
    '<status>blocked</status>',
    '',
    `Cursor SDK provider sessions support image attachments only. Unsupported attachments were not sent: ${shown.join(', ')}${extraCount > 0 ? `, and ${extraCount} more` : ''}.`,
    '',
    'Remove those files, convert them into prompt text, or use a non-Cursor OpenCode model that supports the attachment type.',
  ].join('\n');
};

const formatPromptWithAgentInstructions = ({
  agent,
  instructions,
  prompt,
  runtimeContract = '',
  planFirst = false,
}) => {
  const contextBlocks = [
    ...(runtimeContract
      ? [
          '<cursor_runtime_contract>',
          runtimeContract,
          '</cursor_runtime_contract>',
          '',
        ]
      : []),
    ...(instructions
      ? [
          `<agent_instructions name="${escapeXmlAttribute(agent)}">`,
          instructions,
          '</agent_instructions>',
          '',
        ]
      : []),
  ];
  if (planFirst) {
    const planBreakIndex = prompt.indexOf('\n\n');
    if (planBreakIndex > 0 && prompt.trimStart().startsWith(PLAN_MODE_INSTRUCTION_PREFIX)) {
      return [
        prompt.slice(0, planBreakIndex),
        '',
        ...contextBlocks,
        prompt.slice(planBreakIndex + 2),
      ].join('\n').trim();
    }
    return [
      prompt,
      ...(contextBlocks.length > 0 ? ['', ...contextBlocks] : []),
    ].join('\n').trim();
  }
  return [
    ...contextBlocks,
    '<user_request>',
    prompt,
    '</user_request>',
  ].join('\n');
};

const getUnsupportedCursorAgentMessage = ({ agent }) => {
  const normalized = trimString(agent).toLowerCase();
  if (normalized !== 'council') return '';
  return [
    '<status>blocked</status>',
    '',
    'Cursor SDK provider sessions cannot run the Council agent because it requires the OpenCode council_session plugin tool, and OpenCode plugin tools are not available in Cursor SDK sessions.',
    '',
    'Use a non-Cursor OpenCode model for Council, or use Builder/Orchestrator with Cursor Composer 2.',
  ].join('\n');
};

const normalizeModelId = (value) => {
  const raw = trimString(value);
  if (!raw) return 'auto';
  return raw.startsWith(`${CURSOR_PROVIDER_ID}/`) ? raw.slice(CURSOR_PROVIDER_ID.length + 1) : raw;
};

const isConcreteCursorModel = (modelID) => {
  const model = trimString(modelID);
  return Boolean(model && model !== 'auto');
};

const getCursorRuntimePromptContract = (modelID) => {
  const model = trimString(modelID);
  if (!model || model === 'auto') return '';
  return [
    `This Cursor SDK session is pinned to model "${model}".`,
    'Do not start task/subagent/delegation tools with a different model.',
    'If the request cannot be completed without switching models, return <status>blocked</status> with the reason instead of continuing.',
  ].join('\n');
};

const getCursorDirectPlanModeInstructions = ({ agent, modelID }) => {
  if (trimString(agent).toLowerCase() !== 'orchestrator' || !isConcreteCursorModel(modelID)) {
    return '';
  }
  return [
    `Plan mode is running directly on Cursor model "${trimString(modelID)}".`,
    'Do not call task, subagent, delegation, explorer, fixer, or council tools.',
    'Do not create background work. Do the minimal read-only inspection yourself, then produce the plan.',
    'Return a plan card only: Context, Implementation, and Verification. Do not modify files.',
  ].join('\n');
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

const isCursorTaskTool = (toolName) => {
  const normalized = normalizeRuntimeToolName(toolName);
  return normalized === 'task';
};

const extractCursorToolModelId = (input) => {
  if (!isPlainObject(input)) return '';
  const candidates = [
    input.model,
    input.modelID,
    input.modelId,
    input.model_id,
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) {
      const id = trimString(candidate.id || candidate.modelID || candidate.modelId || candidate.model_id);
      if (id) return normalizeModelId(id);
      continue;
    }
    const id = trimString(candidate);
    if (id) return normalizeModelId(id);
  }
  return '';
};

const buildCursorTaskModelBoundaryViolation = ({ toolName, input, selectedModelID }) => {
  const selected = normalizeModelId(selectedModelID);
  if (!isCursorTaskTool(toolName) || !selected || selected === 'auto') return '';

  const requested = extractCursorToolModelId(input);
  if (!requested || requested === selected) return '';

  return [
    'Cursor SDK model boundary violation:',
    `the task tool requested model "${requested}" while this session is pinned to "${selected}".`,
    'The run was aborted so DevRyan does not silently execute part of the chat on a different model.',
  ].join(' ');
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
  const workerPath = trimString(options.workerPath) || fileURLToPath(new URL('./node-worker.mjs', import.meta.url));
  const workerConfig = resolveCursorSdkWorkerRuntimeConfig({
    env,
    hasInjectedLoadSdk: typeof options.loadSdk === 'function',
    requestedNodeBinary: options.nodeBinary,
    requestedUseNodeWorkerForPrompts: options.useNodeWorkerForPrompts,
    requestedWorkerCwd: options.workerCwd,
    requestedWorkerEnv: options.workerEnv,
    workerPath,
  });
  const {
    nodeBinary,
    useNodeWorkerForPrompts,
    workerCwd,
    workerEnv,
  } = workerConfig;
  const spawnImpl = typeof options.spawnImpl === 'function' ? options.spawnImpl : spawn;
  const getWorkspaceDiff = typeof options.getWorkspaceDiff === 'function' ? options.getWorkspaceDiff : defaultGetWorkspaceDiff;
  const emitEvent = typeof options.emitEvent === 'function' ? options.emitEvent : () => {};
  const logger = options.logger || console;
  const resolveAgentPrompt = typeof options.resolveAgentPrompt === 'function' ? options.resolveAgentPrompt : null;
  const streamIdleTimeoutMs = Math.max(0, Number(options.streamIdleTimeoutMs) || 45000);
  const finalResultWaitTimeoutMs = Math.max(0, Number(options.finalResultWaitTimeoutMs) || 1000);
  const activeRuns = new Map();
  const sessionStatuses = new Map();
  const agentsBySession = new Map();
  let lastModelRecords = fallbackModelRecords();
  let lastModelsSource = 'fallback';
  let lastError = null;
  let lastCancellation = null;

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

  const persistQueues = new Map();

  const enqueuePersist = (sessionID, record) => {
    const previous = persistQueues.get(sessionID) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => appendOrReplaceRecord(sessionID, record))
      .catch((error) => {
        logger.error?.('[CursorSDK] persist failed:', error);
      });
    persistQueues.set(sessionID, next);
    return next;
  };

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
      lastCancellation,
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

  const resolveCursorSdkModelSelection = async ({ modelID, variant }) => {
    const normalizedModelID = normalizeModelId(modelID);
    if (!lastModelRecords || !isPlainObject(lastModelRecords[normalizedModelID])) {
      await discoverModels();
    }
    const selected = getCursorSdkSelectionFromModelRecord(lastModelRecords?.[normalizedModelID], variant);
    return selected || createCursorSdkModelSelection(normalizedModelID, []);
  };

  const getOrCreateAgent = async ({ sessionID, apiKey, modelID, modelSelection, directory }) => {
    const cached = agentsBySession.get(sessionID);
    if (cached) return cached;

    const { Agent } = await loadSdk();
    const state = await readSessionState(sessionID);
    const local = trimString(directory) ? { cwd: directory } : {};
    const model = cloneCursorSdkModelSelection(modelSelection) || createCursorSdkModelSelection(modelID, []);
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

  const createDirectPromptRun = async ({ sessionID, apiKey, modelID, modelSelection, prompt, directory, images }) => {
    const model = cloneCursorSdkModelSelection(modelSelection) || createCursorSdkModelSelection(modelID, []);
    const agent = await getOrCreateAgent({ sessionID, apiKey, modelID, modelSelection: model, directory });
    const message = Array.isArray(images) && images.length > 0
      ? { text: prompt, images }
      : { text: prompt };
    const deltaQueue = createAsyncQueue();
    const run = await agent.send(message, {
      model,
      onDelta: (event) => {
        const sdkMessage = normalizeInteractionUpdateToSdkMessage(event);
        if (sdkMessage) {
          deltaQueue.push({ type: 'message', message: sdkMessage });
        }
      },
    });
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
        const shouldSkipDuplicateMessage = createCrossSourceMessageDedupe();
        const waitEventPromise = waitPromise
          ? waitPromise.then((result) => ({ source: 'wait', result }))
          : null;
        let streamDone = false;
        let deltaDone = false;
        let nextStreamPromise = iterator.next().then((next) => ({ source: 'stream', next }));
        let nextDeltaPromise = deltaQueue.next().then((next) => ({ source: 'delta', next }));

        async function* yieldSdkMessage(source, sdkMessage) {
          if (shouldSkipDuplicateMessage(source, sdkMessage)) return;
          yield { type: 'message', message: sdkMessage };
        }

        async function* yieldPromptEvent(source, promptEvent) {
          if (promptEvent?.type !== 'message') {
            yield promptEvent;
            return;
          }
          yield* yieldSdkMessage(source, promptEvent.message);
        }

        async function* yieldWaitResult(result) {
          if (!result) return;
          if (result.ok === false) {
            throw result.error || new Error('Cursor SDK run failed.');
          }
          if (trimString(result.finalText)) {
            yield* yieldSdkMessage('wait', {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: result.finalText }],
              },
            });
          }
          if (result.finalStatus) {
            yield* yieldSdkMessage('wait', {
              type: 'status',
              status: sdkStatusFromRunStatus(result.result?.status || run.status),
            });
          }
        }

        for (;;) {
          const pending = [];
          if (!streamDone) pending.push(nextStreamPromise);
          if (!deltaDone) pending.push(nextDeltaPromise);
          if (waitEventPromise) pending.push(waitEventPromise);
          if (pending.length === 0) {
            break;
          }
          const event = await Promise.race(pending);

          if (event.source === 'wait') {
            nextStreamPromise.catch(() => {});
            nextDeltaPromise.catch(() => {});
            deltaQueue.close();
            if (typeof iterator.return === 'function') {
              iterator.return().catch(() => {});
            }
            yield* yieldWaitResult(event.result);
            return;
          }

          if (event.source === 'delta') {
            if (event.next?.done) {
              deltaDone = true;
              continue;
            }
            nextDeltaPromise = deltaQueue.next().then((next) => ({ source: 'delta', next }));
            yield* yieldPromptEvent('delta', event.next?.value);
            continue;
          }

          if (event.next?.done) {
            streamDone = true;
            deltaQueue.close();
            continue;
          }
          nextStreamPromise = iterator.next().then((next) => ({ source: 'stream', next }));
          yield* yieldSdkMessage('stream', event.next?.value);
        }

        deltaQueue.close();
        if (waitPromise) {
          yield* yieldWaitResult(await withTimeout(waitPromise, finalResultWaitTimeoutMs));
        }
      },
    };
  };

  const createNodeWorkerPromptRun = async ({ sessionID, apiKey, modelID, modelSelection, prompt, directory, images }) => {
    const state = await readSessionState(sessionID);
    const child = spawnImpl(nodeBinary, [workerPath], {
      cwd: workerCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...workerEnv,
      },
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
      modelSelection: cloneCursorSdkModelSelection(modelSelection) || createCursorSdkModelSelection(modelID, []),
      prompt,
      images: Array.isArray(images) ? images : [],
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

  const buildExecutionPrompt = async ({
    requestedAgent,
    prompt,
    directory,
    modelID,
    isPlanModePrompt,
  }) => {
    const runtimeContract = getCursorRuntimePromptContract(modelID);
    let instructions = isPlanModePrompt
      ? getCursorDirectPlanModeInstructions({ agent: requestedAgent, modelID })
      : '';
    if (!instructions && resolveAgentPrompt && requestedAgent) {
      try {
        instructions = trimString(await resolveAgentPrompt({ agent: requestedAgent, directory }));
      } catch (error) {
        logger.warn?.('[CursorSDK] failed to resolve agent prompt:', error);
      }
    }

    if (!instructions && !runtimeContract) {
      return prompt;
    }

    return formatPromptWithAgentInstructions({
      agent: requestedAgent,
      instructions,
      prompt,
      runtimeContract,
      planFirst: isPlanModePrompt,
    });
  };

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
    const variant = trimString(body?.variant);
    const modelSelection = await resolveCursorSdkModelSelection({ modelID, variant });
    const userMessageID = trimString(body?.messageID) || createId('msg');
    const assistantMessageID = createAssistantMessageId(userMessageID);
    const requestedAgent = trimString(body?.agent);
    const fileParts = normalizePromptFileParts(body, { sessionID, messageID: userMessageID });
    const images = buildCursorImages(fileParts);
    const unsupportedAttachmentMessage = getUnsupportedCursorAttachmentMessage(fileParts);
    const unsupportedAgentMessage = getUnsupportedCursorAgentMessage({
      agent: requestedAgent,
      isPlanModePrompt,
      modelID,
    });
    const unsupportedMessage = unsupportedAttachmentMessage || unsupportedAgentMessage;
    const executionPrompt = unsupportedMessage
      ? prompt
      : await buildExecutionPrompt({
          requestedAgent,
          prompt,
          directory,
          modelID,
          isPlanModePrompt,
        });
    const created = now();
    let partSequence = 0;
    let cancellationSource = null;
    let syntheticPatchPartID = null;
    let sawMutationCandidateTool = false;
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
    userParts.push(...fileParts);

    const userRecord = {
      info: {
        id: userMessageID,
        sessionID,
        role: 'user',
        time: { created },
        providerID: CURSOR_PROVIDER_ID,
        modelID,
        ...(variant ? { variant } : {}),
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
        ...(variant ? { variant } : {}),
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

    const emitStreamingTextPartUpdate = (part, previousPart, recordInfoId, forcePartUpdated) => {
      const messageID = part.messageID || recordInfoId;
      const partID = part.id;
      const nextText = typeof part.text === 'string' ? part.text : '';
      const previousText = previousPart && typeof previousPart.text === 'string' ? previousPart.text : '';

      if (!forcePartUpdated && previousPart) {
        const incrementalDelta = computeIncrementalTextDelta(previousText, nextText);
        if (incrementalDelta) {
          emittedParts.set(partID, part);
          emit({
            type: 'message.part.delta',
            properties: { messageID, partID, field: 'text', delta: incrementalDelta },
          }, directory);
          return;
        }
      }

      emittedParts.set(partID, part);
      emit({ type: 'message.part.updated', properties: { part } }, directory);
    };

    const emitRecordDelta = async (record, options = {}) => {
      const forcePartUpdated = options.forcePartUpdated === true;
      const awaitPersist = options.awaitPersist === true;

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

        if (
          !forcePartUpdated
          && (part.type === 'text' || part.type === 'reasoning')
          && typeof part.text === 'string'
        ) {
          emitStreamingTextPartUpdate(part, previousPart, record.info.id, forcePartUpdated);
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

      const persistPromise = enqueuePersist(sessionID, record);
      if (awaitPersist) {
        await persistPromise;
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
      if (finish === 'cancelled' || cancellationSource) {
        lastCancellation = {
          sessionID,
          assistantMessageID,
          source: cancellationSource || 'provider_or_runtime',
          finalStatus: finish,
          at: completed,
        };
      }
      if (finish === 'stop' && sawMutationCandidateTool) {
        await syncWorkspacePatchPart(completed);
      }

      const hasAssistantText = assistantRecord.parts.some((part) => (
        part?.type === 'text' && trimString(part.text || part.content)
      ));
      const hasToolActivity = assistantRecord.parts.some((part) => part?.type === 'tool');
      if (finish === 'stop' && !hasAssistantText && hasToolActivity) {
        const summaryPartId = nextPartID('text', 'tool_only_completion');
        rawAssistantTextByPartId.set(summaryPartId, TOOL_ONLY_COMPLETION_SUMMARY);
        upsertAssistantPart({
          id: summaryPartId,
          sessionID,
          messageID: assistantMessageID,
          type: 'text',
          text: TOOL_ONLY_COMPLETION_SUMMARY,
          time: { start: completed },
        });
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
      await emitRecordDelta(assistantRecord, { forcePartUpdated: true, awaitPersist: true });
      sessionStatuses.set(sessionID, { type: 'idle' });
      emit({ type: 'session.status', properties: { sessionID, status: { type: 'idle' } } }, directory);
    };

    await emitRecordDelta(userRecord, { awaitPersist: true });
    await emitRecordDelta(assistantRecord, { awaitPersist: true });
    sessionStatuses.set(sessionID, { type: 'busy' });
    emit({ type: 'session.status', properties: { sessionID, status: { type: 'busy' } } }, directory);

    if (unsupportedMessage) {
      applyFinalAssistantText(unsupportedMessage);
      await finalizeAssistantRun('error');
      return {
        handled: true,
        status: 204,
        body: null,
      };
    }

    let run = null;
    try {
      run = await createPromptRun({ sessionID, apiKey, modelID, modelSelection, prompt: executionPrompt, directory, images });
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
    activeRuns.set(sessionID, {
      run,
      assistantMessageID,
      directory,
      markAbortRequested: (source = 'user_abort') => {
        cancellationSource = source;
      },
    });

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
            const input = isPlainObject(message.args) ? message.args : undefined;
            const modelBoundaryViolation = buildCursorTaskModelBoundaryViolation({
              toolName: message.name,
              input,
              selectedModelID: modelID,
            });
            const status = modelBoundaryViolation
              ? 'error'
              : normalizeToolCallStatus(message.status);
            const startedAt = existing?.state?.time?.start || now();
            const output = modelBoundaryViolation || safeJson(message.result);
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
            if (modelBoundaryViolation) {
              applyFinalAssistantText(modelBoundaryViolation);
              await emitRecordDelta(assistantRecord);
              finalStatus = 'error';
              cancellationSource = 'model_boundary';
              try {
                await run.cancel?.();
              } catch {
              }
              if (typeof iterator.return === 'function') {
                iterator.return().catch(() => {});
              }
              break;
            }
            if (isTerminalToolStatus && isWorkspaceMutationCandidateTool(message.name)) {
              sawMutationCandidateTool = true;
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
      active.markAbortRequested?.('user_abort');
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
