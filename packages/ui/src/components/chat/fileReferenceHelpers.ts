import type { FileReadOptions } from '@/lib/api/types';

export type ParsedFileReference = {
  path: string;
  line?: number;
  column?: number;
};

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;
const KNOWN_FILE_BASENAMES = new Set([
  'dockerfile',
  'makefile',
  'readme',
  'license',
  '.env',
  '.gitignore',
  '.npmrc',
]);
const KNOWN_BASENAME_PATTERN = Array.from(KNOWN_FILE_BASENAMES)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

export const normalizePath = (value: string): string => {
  const source = (value || '').trim();
  if (!source) {
    return '';
  }

  const withSlashes = source.replace(/\\/g, '/');
  const hadUncPrefix = withSlashes.startsWith('//');

  let normalized = withSlashes.replace(/\/+/g, '/');
  if (hadUncPrefix && !normalized.startsWith('//')) {
    normalized = `/${normalized}`;
  }

  const isUnixRoot = normalized === '/';
  const isWindowsDriveRoot = /^[A-Za-z]:\/$/.test(normalized);
  if (!isUnixRoot && !isWindowsDriveRoot) {
    normalized = normalized.replace(/\/+$/, '');
  }

  return normalized;
};

const isAbsolutePath = (value: string): boolean => {
  return value.startsWith('/')
    || WINDOWS_DRIVE_PATH_PATTERN.test(value)
    || WINDOWS_UNC_PATH_PATTERN.test(value)
    || value.startsWith('//');
};

const toAbsolutePath = (basePath: string, targetPath: string): string => {
  const normalizedTarget = normalizePath(targetPath);
  if (!normalizedTarget) {
    return normalizePath(basePath);
  }

  if (isAbsolutePath(normalizedTarget)) {
    return normalizedTarget;
  }

  const normalizedBase = normalizePath(basePath);
  if (!normalizedBase) {
    return normalizedTarget;
  }

  const isWindowsDriveBase = /^[A-Za-z]:/.test(normalizedBase);
  const prefix = isWindowsDriveBase ? normalizedBase.slice(0, 2) : '';
  const baseRemainder = isWindowsDriveBase ? normalizedBase.slice(2) : normalizedBase;

  const stack = baseRemainder.split('/').filter(Boolean);
  const parts = normalizedTarget.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }
    stack.push(part);
  }

  if (isWindowsDriveBase) {
    return `${prefix}/${stack.join('/')}`;
  }

  return `/${stack.join('/')}`;
};

const trimPathCandidate = (value: string): string => {
  let next = (value || '').trim();
  if (!next) {
    return '';
  }

  if ((next.startsWith('`') && next.endsWith('`')) || (next.startsWith('"') && next.endsWith('"')) || (next.startsWith("'") && next.endsWith("'"))) {
    next = next.slice(1, -1).trim();
  }

  next = next.replace(/[.,;!?]+$/g, '');

  if (next.endsWith(')') && !next.includes('(')) {
    next = next.slice(0, -1);
  }
  if (next.endsWith(']') && !next.includes('[')) {
    next = next.slice(0, -1);
  }

  return next;
};

const stripTrailingReference = (value: string): string => {
  let next = trimPathCandidate(value);
  if (!next) {
    return '';
  }

  const semicolonIndex = next.indexOf(';');
  if (semicolonIndex >= 0) {
    next = next.slice(0, semicolonIndex);
  }

  next = next.replace(/#.*$/, '');

  const extensionSuffixMatch = next.match(/^(.*\.[A-Za-z0-9_-]{1,16}):.*$/);
  if (extensionSuffixMatch) {
    next = extensionSuffixMatch[1] ?? next;
  }

  const basenameSuffixMatch = KNOWN_BASENAME_PATTERN.length > 0
    ? next.match(new RegExp(`^(.*(?:/|^)(${KNOWN_BASENAME_PATTERN})):.*$`, 'i'))
    : null;
  if (basenameSuffixMatch) {
    next = basenameSuffixMatch[1] ?? next;
  }

  return trimPathCandidate(next);
};

const parseFileReference = (value: string): ParsedFileReference | null => {
  const trimmed = trimPathCandidate(value);
  if (!trimmed) {
    return null;
  }

  const semicolonIndex = trimmed.indexOf(';');
  const withoutSemicolonSuffix = semicolonIndex >= 0
    ? trimPathCandidate(trimmed.slice(0, semicolonIndex))
    : trimmed;
  if (!withoutSemicolonSuffix) {
    return null;
  }

  const hashMatch = withoutSemicolonSuffix.match(/^(.*)#L(\d+)(?:C(\d+))?$/i);
  if (hashMatch) {
    const path = stripTrailingReference(hashMatch[1] ?? '');
    const line = Number.parseInt(hashMatch[2] ?? '', 10);
    const column = hashMatch[3] ? Number.parseInt(hashMatch[3], 10) : undefined;
    if (!path || !Number.isFinite(line)) {
      return null;
    }

    return {
      path,
      line,
      column: Number.isFinite(column ?? Number.NaN) ? column : undefined,
    };
  }

  const colonMatch = withoutSemicolonSuffix.match(/^(.*):(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    const path = stripTrailingReference(colonMatch[1] ?? '');
    const line = Number.parseInt(colonMatch[2] ?? '', 10);
    const column = colonMatch[3] ? Number.parseInt(colonMatch[3], 10) : undefined;
    if (!path || !Number.isFinite(line)) {
      return null;
    }

    return {
      path,
      line,
      column: Number.isFinite(column ?? Number.NaN) ? column : undefined,
    };
  }

  const pathOnly = stripTrailingReference(withoutSemicolonSuffix);
  if (!pathOnly) {
    return null;
  }

  return { path: pathOnly };
};

const hasFileExtension = (path: string): boolean => {
  const base = path.split('/').filter(Boolean).pop() ?? '';
  if (!base || base.endsWith('.')) {
    return false;
  }
  return /\.[A-Za-z0-9_-]{1,16}$/.test(base);
};

const hasNumericOnlyExtension = (path: string): boolean => {
  const base = path.split('/').filter(Boolean).pop() ?? '';
  const match = base.match(/\.([A-Za-z0-9_-]{1,16})$/);
  return Boolean(match?.[1] && /^\d+$/.test(match[1]));
};

const isLikelyFilePathValue = (path: string): boolean => {
  if (!path || path.startsWith('--') || path.includes('://')) {
    return false;
  }

  if (/[<>]/.test(path) || /\s/.test(path)) {
    return false;
  }

  const normalized = normalizePath(path);
  const baseName = normalized.split('/').filter(Boolean).pop() ?? normalized;
  if (!baseName || baseName === '.' || baseName === '..') {
    return false;
  }

  const base = baseName.toLowerCase();
  if (KNOWN_FILE_BASENAMES.has(base) || (base.startsWith('.') && base.length > 1)) {
    return true;
  }

  if (hasNumericOnlyExtension(normalized)) {
    return false;
  }

  return hasFileExtension(normalized);
};

export const isLikelyFilePath = (value: string): boolean => {
  const parsed = parseFileReference(value);
  if (!parsed) {
    return false;
  }
  return isLikelyFilePathValue(parsed.path);
};

export const getResolvedReference = (rawValue: string, effectiveDirectory: string): (ParsedFileReference & { resolvedPath: string }) | null => {
  const parsed = parseFileReference(rawValue);
  if (!parsed || !isLikelyFilePathValue(parsed.path)) {
    return null;
  }

  const resolvedPath = isAbsolutePath(parsed.path)
    ? normalizePath(parsed.path)
    : toAbsolutePath(effectiveDirectory, parsed.path);
  if (!resolvedPath) {
    return null;
  }

  return {
    ...parsed,
    resolvedPath,
  };
};

export const buildFileReferenceStatRequest = (
  resolvedPath: string,
  effectiveDirectory: string,
): { path: string; options: FileReadOptions } | null => {
  const normalizedPath = normalizePath(resolvedPath);
  if (!normalizedPath) {
    return null;
  }

  return {
    path: normalizedPath,
    options: {
      ...(effectiveDirectory ? { directory: normalizePath(effectiveDirectory) } : {}),
      optional: true,
    },
  };
};

export const __testFileReferenceHelpers = {
  isLikelyFilePath,
  buildFileReferenceStatRequest,
};
