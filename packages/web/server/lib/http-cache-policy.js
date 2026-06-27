const DYNAMIC_NO_STORE_PATH_PREFIXES = [
  '/api/',
];

export function shouldDisableHttpCache(originalUrl) {
  if (typeof originalUrl !== 'string') return false;
  if (originalUrl === '/health' || originalUrl.startsWith('/health?')) return true;
  return DYNAMIC_NO_STORE_PATH_PREFIXES.some((prefix) => originalUrl.startsWith(prefix));
}

export function applyDynamicNoStoreHeaders(req, res) {
  if (!shouldDisableHttpCache(req?.originalUrl || req?.url || '')) return;

  // Streaming routes set a stricter no-transform policy in their handlers.
  // Preserve any explicit route-level cache policy if one is already present.
  if (typeof res.getHeader === 'function' && res.getHeader('Cache-Control')) return;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function dynamicNoStoreMiddleware(req, res, next) {
  applyDynamicNoStoreHeaders(req, res);
  next();
}
