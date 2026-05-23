import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverSkills, getSkillSources } from './opencodeConfig';

const writeJson = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

describe('VS Code skill discovery', () => {
  it('does not treat non-file discovered skill paths as editable markdown sources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devryan-vscode-runtime-skill-'));

    try {
      const sources = getSkillSources('runtime-helper', root, {
        name: 'runtime-helper',
        description: 'Runtime helper',
        path: '<built-in>',
        scope: 'user',
        source: 'opencode',
        preferDiscoveredPath: true,
      });

      expect(sources.md.exists).toBe(false);
      expect(sources.md.path).toBe(null);
      expect(sources.md.supportingFiles).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps duplicate skill names when their canonical paths differ', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devryan-vscode-skills-'));
    const opencodeSkill = path.join(root, '.opencode', 'skills', 'lint-helper');
    const agentsSkill = path.join(root, '.agents', 'skills', 'lint-helper');
    fs.mkdirSync(opencodeSkill, { recursive: true });
    fs.mkdirSync(agentsSkill, { recursive: true });
    fs.writeFileSync(path.join(opencodeSkill, 'SKILL.md'), '---\nname: lint-helper\ndescription: Project default\n---\n');
    fs.writeFileSync(path.join(agentsSkill, 'SKILL.md'), '---\nname: lint-helper\ndescription: Agents skill\n---\n');

    try {
      const skills = discoverSkills(root)
        .filter((skill) => skill.name === 'lint-helper' && skill.path.startsWith(root))
        .sort((a, b) => a.path.localeCompare(b.path));

      expect(skills).toHaveLength(2);
      expect(skills.map((skill) => skill.path)).toEqual([
        path.join(root, '.agents', 'skills', 'lint-helper', 'SKILL.md'),
        path.join(root, '.opencode', 'skills', 'lint-helper', 'SKILL.md'),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('VS Code Cursor SDK config handling', () => {
  let tempHome;
  let originalHome;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (tempHome) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = undefined;
    vi.resetModules();
  });

  const loadRuntime = async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'devryan-vscode-cursor-provider-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    vi.resetModules();
    return import('./opencodeConfig');
  };

  it('does not generate the old open-cursor provider in runtime overlays', async () => {
    const { syncRuntimeAgentOverlays } = await loadRuntime();
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devryan-vscode-cursor-project-'));
    const configPath = path.join(tempHome, '.config', 'opencode', 'opencode.json');
    writeJson(configPath, {
      plugin: ['@rama_nigg/open-cursor@latest'],
      provider: {
        'cursor-acp': {
          name: 'Cursor',
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:32124/v1',
          },
          models: {
            'claude-opus-4-7': { name: 'claude opus 4 7' },
            'claude-opus-4-7-thinking-xhigh': { name: 'claude opus 4 7 thinking extra high' },
          },
        },
      },
    });

    const result = syncRuntimeAgentOverlays(projectDir);
    const overlayConfigPath = path.join(result.targetConfigDirectory, 'opencode.json');

    expect(fs.existsSync(overlayConfigPath)).toBe(false);
    expect(JSON.stringify(readJson(configPath))).toContain('@rama_nigg/open-cursor@latest');
    fs.rmSync(projectDir, { recursive: true, force: true });
  });
});

describe('VS Code MCP OAuth stale-state handling', () => {
  let tempHome;
  let originalHome;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (tempHome) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = undefined;
    vi.resetModules();
  });

  const loadRuntime = async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'devryan-vscode-mcp-oauth-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    vi.resetModules();
    return import('./opencodeConfig');
  };

  const mcpAuthPath = () => path.join(tempHome, '.local', 'share', 'opencode', 'mcp-auth.json');

  it('deletes matching MCP OAuth cache when deleting an MCP config', async () => {
    const { deleteMcpConfig } = await loadRuntime();
    writeJson(path.join(tempHome, '.config', 'opencode', 'opencode.json'), {
      mcp: {
        linear: { type: 'remote', url: 'https://mcp.linear.app/mcp' },
      },
    });
    writeJson(mcpAuthPath(), {
      linear: { clientInfo: { client_id: 'stale-linear' }, oauthState: 'old-state' },
      supabase: { clientInfo: { client_id: 'keep-supabase' }, oauthState: 'keep-state' },
    });

    deleteMcpConfig('linear');

    expect(readJson(mcpAuthPath())).toEqual({
      supabase: { clientInfo: { client_id: 'keep-supabase' }, oauthState: 'keep-state' },
    });
  });

  it('invalidates matching MCP OAuth cache when OAuth redirect changes', async () => {
    const { updateMcpConfig } = await loadRuntime();
    writeJson(path.join(tempHome, '.config', 'opencode', 'opencode.json'), {
      mcp: {
        supabase: {
          type: 'remote',
          url: 'https://mcp.supabase.com/mcp',
          oauth: { redirectUri: 'http://localhost:55676/mcp/oauth/callback' },
        },
      },
    });
    writeJson(mcpAuthPath(), {
      supabase: { clientInfo: { client_id: 'stale-supabase' }, oauthState: 'old-state' },
    });

    updateMcpConfig('supabase', {
      oauth: { redirectUri: 'http://127.0.0.1:55676/mcp/oauth/callback' },
    });

    expect(readJson(mcpAuthPath())).toEqual({});
  });

  it('does not recover explicitly deleted MCP configs', async () => {
    const {
      deleteMcpConfig,
      recoverMcpConfigs,
      listMcpConfigs,
    } = await loadRuntime();
    const projectDir = path.join(tempHome, 'project');
    writeJson(path.join(projectDir, 'opencode.json'), {
      mcp: {
        linear: { type: 'remote', url: 'https://mcp.linear.app/mcp' },
      },
    });
    writeJson(path.join(projectDir, 'opencode.json.openchamber.backup'), {
      mcp: {
        linear: { type: 'remote', url: 'https://stale-linear.example.test/mcp' },
      },
    });

    deleteMcpConfig('linear', projectDir);
    const recovered = recoverMcpConfigs(projectDir);

    expect(recovered.migrated).toEqual([]);
    expect(recovered.skipped).toContainEqual({ name: 'linear', reason: 'deleted' });
    expect(listMcpConfigs(projectDir).find((entry) => entry.name === 'linear')).toBeUndefined();
  });
});
