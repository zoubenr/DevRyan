import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempHome;
let originalHome;

const writeJson = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const loadMcpSourcesModule = async () => {
  vi.resetModules();
  return import('./mcp-sources.js');
};

describe('MCP source helpers', () => {
  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'devryan-mcp-sources-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
    vi.resetModules();
  });

  it('defaults clean project MCP writes to the project .opencode config', async () => {
    const projectDir = path.join(tempHome, 'project');
    const { getProjectMcpWritePath } = await loadMcpSourcesModule();

    expect(getProjectMcpWritePath(projectDir)).toBe(path.join(projectDir, '.opencode', 'opencode.json'));
  });

  it('prefers existing project .opencode MCP config over root project config for writes', async () => {
    const projectDir = path.join(tempHome, 'project');
    const legacyPath = path.join(projectDir, '.opencode', 'opencode.json');
    const rootPath = path.join(projectDir, 'opencode.json');
    writeJson(rootPath, { mcp: { root: { type: 'local', command: ['root'] } } });
    writeJson(legacyPath, { mcp: { legacy: { type: 'local', command: ['legacy'] } } });

    const { getProjectMcpWritePath } = await loadMcpSourcesModule();

    expect(getProjectMcpWritePath(projectDir)).toBe(legacyPath);
  });

  it('uses an existing root project MCP config when no .opencode config exists', async () => {
    const projectDir = path.join(tempHome, 'project');
    const rootPath = path.join(projectDir, 'opencode.json');
    writeJson(rootPath, { mcp: { root: { type: 'local', command: ['root'] } } });

    const { getProjectMcpWritePath } = await loadMcpSourcesModule();

    expect(getProjectMcpWritePath(projectDir)).toBe(rootPath);
  });

  it('lists home .opencode MCP config as a user-scoped source', async () => {
    const homePath = path.join(tempHome, '.opencode', 'opencode.json');
    writeJson(homePath, {
      mcp: {
        home: { type: 'remote', url: 'https://home.example.test/mcp' },
      },
    });

    const { describeMcpSource, getActiveMcpSources } = await loadMcpSourcesModule();
    const sources = getActiveMcpSources().map(describeMcpSource);

    expect(sources).toContainEqual({
      path: homePath,
      scope: 'user',
      kind: 'user-home',
      active: true,
      recoverable: false,
      targetPath: path.join(tempHome, '.config', 'opencode', 'opencode.json'),
      origin: 'opencode',
    });
  });
});
