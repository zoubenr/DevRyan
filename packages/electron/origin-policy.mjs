/** @typedef {{ localOrigin?: string | null, hostUrls?: string[], envServerUrl?: string | null }} ContentOriginPolicy */

export const PRIVILEGED_NULL_ORIGIN = 'null';

/**
 * Normalizes an http(s) URL or origin string to `url.origin`, or returns null.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export const normalizeHttpOrigin = (raw) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

/**
 * Privileged renderer surfaces: exact app local origin, file://, about:blank.
 * @param {string} origin
 * @param {string | null | undefined} localOrigin
 * @returns {boolean}
 */
export const isPrivilegedRendererOrigin = (origin, localOrigin) => {
  if (origin === PRIVILEGED_NULL_ORIGIN) {
    return true;
  }
  const allowed = normalizeHttpOrigin(localOrigin);
  return Boolean(allowed && origin === allowed);
};

/**
 * @param {string} rawUrl
 * @param {string | null | undefined} localOrigin
 * @returns {boolean}
 */
export const isPrivilegedRendererUrl = (rawUrl, localOrigin) => {
  const raw = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!raw) {
    return false;
  }
  if (raw.startsWith('file://') || raw === 'about:blank') {
    return true;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return isPrivilegedRendererOrigin(url.origin, localOrigin);
  } catch {
    return false;
  }
};

/**
 * Origins that may load inside Electron (navigation / new window), not IPC privilege.
 * @param {ContentOriginPolicy} policy
 * @returns {Set<string>}
 */
export const collectAllowedContentOrigins = (policy) => {
  const origins = new Set();
  const add = (raw) => {
    const origin = normalizeHttpOrigin(raw);
    if (origin) {
      origins.add(origin);
    }
  };
  add(policy.localOrigin);
  for (const entry of policy.hostUrls || []) {
    add(entry);
  }
  add(policy.envServerUrl);
  return origins;
};

/**
 * @param {string} raw
 * @param {ContentOriginPolicy} policy
 * @returns {boolean}
 */
export const isAllowedElectronContentUrl = (raw, policy) => {
  try {
    const url = new URL(raw);
    if (url.protocol === 'file:' || url.protocol === 'about:' || url.protocol === 'devtools:') {
      return true;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return collectAllowedContentOrigins(policy).has(url.origin);
  } catch {
    return false;
  }
};

/**
 * JS expression for init-script privileged checks (uses __oc_origin, __oc_local).
 * @returns {string}
 */
export const privilegedOriginGuardJs = () => (
  "(__oc_origin==='null'||(__oc_local&&__oc_origin===__oc_local))"
);
