import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';

const execFileAsync = promisify(execFile);
const SESSION_MESSAGE_LIMIT = 1000;
const scopedRevertLocks = new Map();

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const parseScopedRevertJson = (req, res, next) => {
  express.json({ limit: '64kb' })(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    return next();
  });
};

const encodeDirectoryQuery = (directory) => {
  const params = new URLSearchParams();
  params.set('directory', directory);
  return params.toString();
};

const ensureInsideDirectory = (directory, filePath) => {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Invalid diff file path');
  }

  const root = path.resolve(directory);
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);

  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Diff file path escapes the project directory: ${filePath}`);
  }

  return { absolute, relative: normalized };
};

const fileExists = async (absolutePath) => {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const readSnapshot = async (directory, filePath) => {
  const { absolute, relative } = ensureInsideDirectory(directory, filePath);
  try {
    return {
      path: relative,
      absolute,
      exists: true,
      content: await fs.readFile(absolute),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { path: relative, absolute, exists: false, content: Buffer.alloc(0) };
    }
    throw error;
  }
};

const writeSnapshot = async (snapshot) => {
  if (!snapshot.exists) {
    await fs.rm(snapshot.absolute, { recursive: true, force: true });
    return;
  }

  await fs.mkdir(path.dirname(snapshot.absolute), { recursive: true });
  await fs.writeFile(snapshot.absolute, snapshot.content);
};

const textToSnapshot = (snapshot, text) => ({
  ...snapshot,
  exists: true,
  content: Buffer.from(text, 'utf8'),
});

const deletedSnapshot = (snapshot) => ({
  ...snapshot,
  exists: false,
  content: Buffer.alloc(0),
});

const normalizeText = (value) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const splitLines = (value) => {
  const normalized = normalizeText(value);
  if (normalized.length === 0) return [];
  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
};

const joinLines = (lines, finalNewline) => {
  if (lines.length === 0) return '';
  return `${lines.join('\n')}${finalNewline ? '\n' : ''}`;
};

export const parseUnifiedPatch = (patch) => {
  if (typeof patch !== 'string' || patch.trim().length === 0) {
    return [];
  }

  const lines = normalizeText(patch).split('\n');
  const hunks = [];
  let current = null;

  for (const line of lines) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldCount: header[2] ? Number(header[2]) : 1,
        newStart: Number(header[3]),
        newCount: header[4] ? Number(header[4]) : 1,
        lines: [],
      };
      hunks.push(current);
      continue;
    }

    if (!current) continue;
    if (line.startsWith('diff --git ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    if (line.startsWith('\\')) continue;
    if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
      current.lines.push(line);
    }
  }

  return hunks;
};

const hunkTargetLines = (hunk) => hunk.lines
  .filter((line) => line.startsWith(' ') || line.startsWith('+'))
  .map((line) => line.slice(1));

const hunkReplacementLines = (hunk) => hunk.lines
  .filter((line) => line.startsWith(' ') || line.startsWith('-'))
  .map((line) => line.slice(1));

const findSequence = (lines, sequence, preferredIndex) => {
  if (sequence.length === 0) {
    return Math.max(0, Math.min(preferredIndex, lines.length));
  }

  const matches = [];
  const limit = lines.length - sequence.length;
  for (let index = 0; index <= limit; index += 1) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (lines[index + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push(index);
  }

  if (matches.length === 0) return -1;
  return matches.reduce((best, candidate) => (
    Math.abs(candidate - preferredIndex) < Math.abs(best - preferredIndex) ? candidate : best
  ), matches[0]);
};

export const reverseApplyUnifiedPatch = (currentText, patch, filePath) => {
  const hunks = parseUnifiedPatch(patch).sort((a, b) => b.newStart - a.newStart);
  let lines = splitLines(currentText);
  const finalNewline = normalizeText(currentText).endsWith('\n');

  for (const hunk of hunks) {
    const target = hunkTargetLines(hunk);
    const replacement = hunkReplacementLines(hunk);
    const index = findSequence(lines, target, Math.max(0, hunk.newStart - 1));
    if (index < 0) {
      throw new Error(`Cannot safely revert ${filePath}; the changed hunk was modified by another change`);
    }
    lines = [
      ...lines.slice(0, index),
      ...replacement,
      ...lines.slice(index + target.length),
    ];
  }

  return joinLines(lines, finalNewline);
};

const extractPatchSideContent = (patch, side) => {
  const lines = [];
  for (const hunk of parseUnifiedPatch(patch)) {
    for (const line of hunk.lines) {
      if (line.startsWith(' ')) {
        lines.push(line.slice(1));
      } else if (side === 'before' && line.startsWith('-')) {
        lines.push(line.slice(1));
      } else if (side === 'after' && line.startsWith('+')) {
        lines.push(line.slice(1));
      }
    }
  }
  return joinLines(lines, true);
};

const assertSnapshotTextEquals = (snapshot, expectedText, filePath) => {
  const actualText = snapshot.exists ? normalizeText(snapshot.content.toString('utf8')) : '';
  if (actualText !== normalizeText(expectedText)) {
    throw new Error(`Cannot safely revert ${filePath}; the file no longer matches the session diff`);
  }
};

const reverseApplyDiffToSnapshot = (snapshot, diff) => {
  const filePath = diff.file;
  const status = diff.status;
  const patch = typeof diff.patch === 'string' ? diff.patch : '';
  const hunks = parseUnifiedPatch(patch);

  if (status && !['added', 'deleted', 'modified'].includes(status)) {
    throw new Error(`Cannot safely revert ${filePath}; unsupported diff status ${status}`);
  }

  if (hunks.length === 0) {
    throw new Error(`Cannot safely revert ${filePath}; the session diff has no text patch`);
  }

  if (status === 'added') {
    assertSnapshotTextEquals(snapshot, extractPatchSideContent(patch, 'after'), filePath);
    return deletedSnapshot(snapshot);
  }

  if (status === 'deleted') {
    if (snapshot.exists) {
      throw new Error(`Cannot safely revert ${filePath}; the deleted file was recreated by another change`);
    }
    return textToSnapshot(snapshot, extractPatchSideContent(patch, 'before'));
  }

  if (!snapshot.exists) {
    throw new Error(`Cannot safely revert ${filePath}; the file is missing`);
  }

  return textToSnapshot(
    snapshot,
    reverseApplyUnifiedPatch(snapshot.content.toString('utf8'), patch, filePath),
  );
};

const looksLikePorcelainStatus = (entry) => entry.length >= 4 && entry[2] === ' ';

const collectGitStatusFiles = async (directory) => {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: directory,
      maxBuffer: 10 * 1024 * 1024,
    });
    const entries = stdout.split('\0').filter(Boolean);
    const files = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!looksLikePorcelainStatus(entry)) continue;
      files.push(entry.slice(3));
      const status = entry.slice(0, 2);
      if ((status.includes('R') || status.includes('C')) && entries[index + 1] && !looksLikePorcelainStatus(entries[index + 1])) {
        files.push(entries[index + 1]);
        index += 1;
      }
    }
    return files;
  } catch (error) {
    const detail = error?.stderr || error?.message || String(error);
    throw new Error(`Scoped session revert requires a Git worktree so unrelated changes can be protected: ${detail}`);
  }
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isObject(payload) && typeof payload.error === 'string' ? payload.error : response.statusText;
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return payload;
};

const fetchSessionMessages = async ({ buildOpenCodeUrl, getOpenCodeAuthHeaders, directory, sessionID }) => {
  const query = new URLSearchParams({ directory, limit: String(SESSION_MESSAGE_LIMIT) });
  return fetchJson(buildOpenCodeUrl(`/session/${encodeURIComponent(sessionID)}/message?${query}`, ''), {
    method: 'GET',
    headers: { Accept: 'application/json', ...getOpenCodeAuthHeaders() },
    signal: AbortSignal.timeout(15_000),
  });
};

const callUpstreamRevert = async ({ buildOpenCodeUrl, getOpenCodeAuthHeaders, directory, sessionID, messageID }) => fetchJson(
  buildOpenCodeUrl(`/session/${encodeURIComponent(sessionID)}/revert?${encodeDirectoryQuery(directory)}`, ''),
  {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getOpenCodeAuthHeaders(),
    },
    body: JSON.stringify({ messageID }),
    signal: AbortSignal.timeout(30_000),
  },
);

const sortMessageRecords = (records) => [...records].sort((a, b) => {
  const aInfo = a?.info ?? {};
  const bInfo = b?.info ?? {};
  const aTime = typeof aInfo.time?.created === 'number' ? aInfo.time.created : 0;
  const bTime = typeof bInfo.time?.created === 'number' ? bInfo.time.created : 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(aInfo.id ?? '').localeCompare(String(bInfo.id ?? ''));
});

const collectRevertDiffs = (records, messageID) => {
  const ordered = sortMessageRecords(Array.isArray(records) ? records : []);
  const targetIndex = ordered.findIndex((record) => record?.info?.id === messageID);
  if (targetIndex < 0) {
    throw new Error('Target message was not found in the session');
  }

  const diffs = [];
  for (const record of ordered.slice(targetIndex)) {
    const info = record?.info;
    if (info?.role !== 'user' || !Array.isArray(info.summary?.diffs)) continue;
    for (const diff of info.summary.diffs) {
      if (typeof diff?.file === 'string' && typeof diff.patch === 'string') {
        diffs.push(diff);
      }
    }
  }

  return diffs;
};

const prepareScopedRevert = async (directory, diffs) => {
  const targetFiles = new Set();
  for (const diff of diffs) {
    targetFiles.add(ensureInsideDirectory(directory, diff.file).relative);
  }

  // Decision: use Git status as the protection boundary before calling OpenCode's
  // broad revert. Without a worktree status snapshot we cannot know which
  // unrelated files another chat changed, so the endpoint fails instead of
  // risking hidden data loss.
  const protectedFiles = new Set(await collectGitStatusFiles(directory));
  for (const file of targetFiles) protectedFiles.add(file);

  const snapshots = new Map();
  for (const file of protectedFiles) {
    const snapshot = await readSnapshot(directory, file);
    snapshots.set(snapshot.path, snapshot);
  }

  const desiredTargetSnapshots = new Map();
  for (const file of targetFiles) {
    desiredTargetSnapshots.set(file, snapshots.get(file) ?? await readSnapshot(directory, file));
  }

  for (const diff of [...diffs].reverse()) {
    const { relative } = ensureInsideDirectory(directory, diff.file);
    desiredTargetSnapshots.set(relative, reverseApplyDiffToSnapshot(desiredTargetSnapshots.get(relative), diff));
  }

  return { snapshots, desiredTargetSnapshots };
};

const restoreProtectedSnapshots = async ({ snapshots, desiredTargetSnapshots }, { restoreOriginal = false } = {}) => {
  const failures = [];
  for (const [file, snapshot] of snapshots) {
    const targetSnapshot = restoreOriginal ? snapshot : desiredTargetSnapshots.get(file);
    try {
      await writeSnapshot(targetSnapshot ?? snapshot);
    } catch (error) {
      failures.push(`${file}: ${error?.message || String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Failed to restore protected files after session revert: ${failures.join('; ')}`);
  }
};

const withDirectoryScopedRevertLock = async (directory, task) => {
  const key = path.resolve(directory);
  const previous = scopedRevertLocks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => {}).then(() => current);
  scopedRevertLocks.set(key, chained);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (scopedRevertLocks.get(key) === chained) {
      scopedRevertLocks.delete(key);
    }
  }
};

export const runScopedSessionRevert = async ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  directory,
  sessionID,
  messageID,
}) => {
  return withDirectoryScopedRevertLock(directory, async () => {
    const records = await fetchSessionMessages({ buildOpenCodeUrl, getOpenCodeAuthHeaders, directory, sessionID });
    const diffs = collectRevertDiffs(records, messageID);
    const prepared = await prepareScopedRevert(directory, diffs);
    let session;
    try {
      session = await callUpstreamRevert({ buildOpenCodeUrl, getOpenCodeAuthHeaders, directory, sessionID, messageID });
    } catch (error) {
      await restoreProtectedSnapshots(prepared, { restoreOriginal: true });
      throw error;
    }
    await restoreProtectedSnapshots(prepared);
    return session;
  });
};

export const registerScopedSessionRevertRoute = (app, deps) => {
  // Keep JSON parsing route-local because /api/openchamber/* is intentionally
  // registered before the generic /api proxy and is not covered by common API
  // middleware in all runtimes/test harnesses.
  app.post('/api/openchamber/session/:sessionID/scoped-revert', parseScopedRevertJson, async (req, res) => {
    try {
      const sessionID = req.params.sessionID;
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      const body = isObject(req.body) ? req.body : {};
      const messageID = typeof body.messageID === 'string' ? body.messageID : '';

      if (!sessionID) {
        return res.status(400).json({ error: 'sessionID parameter is required' });
      }
      if (!directory) {
        return res.status(400).json({ error: 'directory query parameter is required' });
      }
      if (!messageID) {
        return res.status(400).json({ error: 'messageID is required' });
      }

      const session = await runScopedSessionRevert({
        buildOpenCodeUrl: deps.buildOpenCodeUrl,
        getOpenCodeAuthHeaders: deps.getOpenCodeAuthHeaders,
        directory,
        sessionID,
        messageID,
      });
      return res.json(session);
    } catch (error) {
      console.error('[scoped-revert] Failed to revert session safely:', error);
      return res.status(409).json({ error: error?.message || 'Failed to revert session safely' });
    }
  });
};
