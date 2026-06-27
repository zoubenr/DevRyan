import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const configuredSdkPaths = new WeakMap();

const binaryNameForPlatform = (platform) => (platform === 'win32' ? 'rg.exe' : 'rg');

const pathDelimiterForPlatform = (platform) => (platform === 'win32' ? ';' : path.delimiter);

const cursorPlatformPackageName = (platform, arch) => {
  const normalizedPlatform = trimString(platform) || process.platform;
  const normalizedArch = trimString(arch) || process.arch;
  if (!['darwin', 'linux', 'win32'].includes(normalizedPlatform)) return '';
  if (!['arm64', 'x64'].includes(normalizedArch)) return '';
  if (normalizedPlatform === 'win32' && normalizedArch !== 'x64') return '';
  return `sdk-${normalizedPlatform}-${normalizedArch}`;
};

const canUsePath = (candidate, { platform = process.platform } = {}) => {
  const normalized = trimString(candidate);
  if (!normalized) return false;
  try {
    const stat = fs.statSync(normalized);
    if (!stat.isFile()) return false;
    const accessMode = platform === 'win32'
      ? fs.constants.F_OK
      : fs.constants.F_OK | fs.constants.X_OK;
    fs.accessSync(normalized, accessMode);
    return true;
  } catch {
    return false;
  }
};

const resolveElectronResourcesRipgrepPath = ({ resourcesPath, platform, arch }) => {
  const packageName = cursorPlatformPackageName(platform, arch);
  const normalizedResourcesPath = trimString(resourcesPath);
  if (!packageName || !normalizedResourcesPath) return '';
  const candidate = path.join(
    normalizedResourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@cursor',
    packageName,
    'bin',
    binaryNameForPlatform(platform),
  );
  return canUsePath(candidate, { platform }) ? candidate : '';
};

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

const addExistingRoot = (roots, value) => {
  const normalized = trimString(value);
  if (!normalized) return;
  roots.add(path.resolve(normalized));
  try {
    roots.add(fs.realpathSync(normalized));
  } catch {
    // Best-effort: the original path may still be useful for ancestor probing.
  }
};

const packageSearchRootCandidates = ({ packageSearchRoots, requireResolve }) => {
  const roots = new Set();
  for (const root of Array.isArray(packageSearchRoots) ? packageSearchRoots : []) {
    addExistingRoot(roots, root);
  }
  addExistingRoot(roots, process.cwd());
  addExistingRoot(roots, moduleDirectory);

  const resolvePackage = typeof requireResolve === 'function'
    ? requireResolve
    : (specifier) => require.resolve(specifier);
  try {
    addExistingRoot(roots, path.dirname(resolvePackage('@cursor/sdk/package.json')));
  } catch {
    // The platform package may still be present as an optional package.
  }

  return Array.from(roots);
};

const expandAncestorRoots = (roots) => {
  const expanded = new Set();
  for (const root of roots) {
    let current = trimString(root);
    if (!current) continue;
    current = path.resolve(current);
    try {
      const stat = fs.statSync(current);
      if (stat.isFile()) {
        current = path.dirname(current);
      }
    } catch {
      // Continue with the resolved path; its ancestors may still exist.
    }

    while (current && !expanded.has(current)) {
      expanded.add(current);
      const parent = path.dirname(current);
      if (!parent || parent === current) break;
      current = parent;
    }
  }
  return Array.from(expanded);
};

const resolveBunCentralStoreRipgrepPath = ({
  packageName,
  platform,
  packageSearchRoots,
  requireResolve,
}) => {
  const roots = expandAncestorRoots(packageSearchRootCandidates({ packageSearchRoots, requireResolve }));
  for (const root of roots) {
    const candidate = path.join(
      root,
      'node_modules',
      '.bun',
      'node_modules',
      '@cursor',
      packageName,
      'bin',
      binaryNameForPlatform(platform),
    );
    if (canUsePath(candidate, { platform })) return candidate;
  }
  return '';
};

const resolvePackageRipgrepPath = ({ platform, arch, requireResolve, packageSearchRoots }) => {
  const packageName = cursorPlatformPackageName(platform, arch);
  if (!packageName) return '';
  const resolvePackage = typeof requireResolve === 'function'
    ? requireResolve
    : (specifier) => require.resolve(specifier);
  try {
    const packageJsonPath = resolvePackage(`@cursor/${packageName}/package.json`);
    const candidate = path.join(path.dirname(packageJsonPath), 'bin', binaryNameForPlatform(platform));
    if (canUsePath(candidate, { platform })) return candidate;
  } catch {
    // Bun may install optional packages in node_modules/.bun/node_modules,
    // where Node's normal require.resolve cannot always see them.
  }
  return resolveBunCentralStoreRipgrepPath({
    packageName,
    platform,
    packageSearchRoots,
    requireResolve,
  });
};

const resolvePathRipgrepPath = ({ env, pathValue, platform }) => {
  const rawPath = typeof pathValue === 'string'
    ? pathValue
    : trimString(env?.PATH) || trimString(env?.Path);
  if (!rawPath) return '';
  const binaryName = binaryNameForPlatform(platform);
  for (const entry of rawPath.split(pathDelimiterForPlatform(platform))) {
    const directory = trimString(entry);
    if (!directory) continue;
    const candidate = path.join(directory, binaryName);
    if (canUsePath(candidate, { platform })) return candidate;
  }
  return '';
};

export const resolveCursorRipgrepPath = ({
  explicitRipgrepPath = '',
  env = process.env,
  pathValue,
  platform = process.platform,
  arch = process.arch,
  resourcesPath = process.resourcesPath,
  requireResolve,
  packageSearchRoots,
} = {}) => {
  const explicit = trimString(explicitRipgrepPath) || trimString(env?.CURSOR_SDK_RIPGREP_PATH);
  if (canUsePath(explicit, { platform })) {
    return { path: explicit, source: 'explicit' };
  }

  const electronResourcesPath = resolveElectronResourcesRipgrepPath({ resourcesPath, platform, arch });
  if (electronResourcesPath) {
    return { path: electronResourcesPath, source: 'electron-resources' };
  }

  const packagePath = resolvePackageRipgrepPath({ platform, arch, requireResolve, packageSearchRoots });
  if (packagePath) {
    return { path: packagePath, source: 'package' };
  }

  const pathRipgrepPath = resolvePathRipgrepPath({ env, pathValue, platform });
  if (pathRipgrepPath) {
    return { path: pathRipgrepPath, source: 'path' };
  }

  return { path: '', source: 'missing' };
};

const getConfigureRipgrepPath = (sdk) => {
  if (typeof sdk?.configureRipgrepPath === 'function') return sdk.configureRipgrepPath.bind(sdk);
  if (typeof sdk?.default?.configureRipgrepPath === 'function') {
    return sdk.default.configureRipgrepPath.bind(sdk.default);
  }
  return null;
};

export const configureCursorSdkRipgrep = (sdk, options = {}) => {
  const resolved = resolveCursorRipgrepPath(options);
  const configureRipgrepPath = getConfigureRipgrepPath(sdk);
  if (!configureRipgrepPath) {
    return {
      configured: false,
      source: 'unsupported',
      usable: Boolean(resolved.path),
      resolvedSource: resolved.source,
      configureSupported: false,
    };
  }

  if (!resolved.path) return { configured: false, source: resolved.source };

  if (sdk && typeof sdk === 'object') {
    const previousPath = configuredSdkPaths.get(sdk);
    if (previousPath === resolved.path) {
      return { configured: true, source: resolved.source };
    }
  }

  configureRipgrepPath(resolved.path);
  if (sdk && typeof sdk === 'object') {
    configuredSdkPaths.set(sdk, resolved.path);
  }
  return { configured: true, source: resolved.source };
};
