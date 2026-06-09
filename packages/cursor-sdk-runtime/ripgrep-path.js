import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

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

const canUsePath = (candidate) => {
  const normalized = trimString(candidate);
  if (!normalized) return false;
  try {
    fs.accessSync(normalized, fs.constants.F_OK);
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
  return canUsePath(candidate) ? candidate : '';
};

const resolvePackageRipgrepPath = ({ platform, arch, requireResolve }) => {
  const packageName = cursorPlatformPackageName(platform, arch);
  if (!packageName) return '';
  const resolvePackage = typeof requireResolve === 'function'
    ? requireResolve
    : (specifier) => require.resolve(specifier);
  try {
    const packageJsonPath = resolvePackage(`@cursor/${packageName}/package.json`);
    const candidate = path.join(path.dirname(packageJsonPath), 'bin', binaryNameForPlatform(platform));
    return canUsePath(candidate) ? candidate : '';
  } catch {
    return '';
  }
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
    if (canUsePath(candidate)) return candidate;
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
} = {}) => {
  const explicit = trimString(explicitRipgrepPath) || trimString(env?.CURSOR_SDK_RIPGREP_PATH);
  if (explicit) {
    return { path: explicit, source: 'explicit' };
  }

  const electronResourcesPath = resolveElectronResourcesRipgrepPath({ resourcesPath, platform, arch });
  if (electronResourcesPath) {
    return { path: electronResourcesPath, source: 'electron-resources' };
  }

  const packagePath = resolvePackageRipgrepPath({ platform, arch, requireResolve });
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
  const configureRipgrepPath = getConfigureRipgrepPath(sdk);
  if (!configureRipgrepPath) {
    return { configured: false, source: 'unsupported' };
  }

  const resolved = resolveCursorRipgrepPath(options);
  if (!resolved.path) {
    return { configured: false, source: resolved.source };
  }

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
