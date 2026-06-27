const warnCacheClearFailure = (log, label, error) => {
  try {
    log?.warn?.(`[electron] failed to clear ${label}:`, error);
  } catch {
  }
};

export const clearElectronRuntimeCaches = async ({ defaultSession, log } = {}) => {
  const errors = [];

  const run = async (label, action) => {
    if (typeof action !== 'function') return;
    try {
      await action();
    } catch (error) {
      errors.push(error);
      warnCacheClearFailure(log, label, error);
    }
  };

  await run('HTTP cache', () => defaultSession?.clearCache?.());
  await run('code cache', () => defaultSession?.clearCodeCaches?.({ urls: [] }));

  return {
    ok: errors.length === 0,
    errors,
  };
};
