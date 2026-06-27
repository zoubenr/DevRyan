const HARNESS_STATUSES = new Set(['success', 'warning', 'error']);

function normalizeStatus(status) {
  return HARNESS_STATUSES.has(status) ? status : 'error';
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry !== null && entry !== undefined);
}

function normalizeRecovery(recovery) {
  if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)) {
    return null;
  }

  return {
    rootCauseHint: normalizeText(recovery.rootCauseHint, 'No root cause hint was provided'),
    safeRetry: normalizeText(recovery.safeRetry, 'Retry the operation after checking the reported condition'),
    stopCondition: normalizeText(recovery.stopCondition, 'Stop retrying if the same condition persists'),
    retryable: recovery.retryable !== false,
  };
}

function createHarnessResult(status, options = {}) {
  return {
    status: normalizeStatus(status),
    summary: normalizeText(options.summary, 'Operation completed'),
    nextActions: normalizeList(options.nextActions),
    artifacts: normalizeList(options.artifacts),
    recovery: normalizeRecovery(options.recovery),
  };
}

function createHarnessSuccess(options = {}) {
  return createHarnessResult('success', options);
}

function createHarnessWarning(options = {}) {
  return createHarnessResult('warning', options);
}

function createHarnessError(options = {}) {
  return createHarnessResult('error', options);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withHarnessResult(payload, harnessInput) {
  const harness = isPlainObject(harnessInput)
    ? createHarnessResult(harnessInput.status, harnessInput)
    : createHarnessError({ summary: 'Harness metadata was unavailable' });
  const base = isPlainObject(payload) ? { ...payload } : { data: payload };
  const additive = {};

  for (const key of ['status', 'summary', 'nextActions', 'artifacts', 'recovery']) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      additive[key] = harness[key];
    }
  }

  return {
    ...base,
    ...additive,
    harness,
  };
}

export {
  createHarnessError,
  createHarnessResult,
  createHarnessSuccess,
  createHarnessWarning,
  withHarnessResult,
};
