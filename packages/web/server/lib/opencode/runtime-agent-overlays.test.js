import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yaml from 'yaml';

import { syncRuntimeAgentOverlays } from './runtime-agent-overlays.js';

const writeAgent = async (agentDirectory, name, frontmatterLines, prompt) => {
  await fs.mkdir(agentDirectory, { recursive: true });
  await fs.writeFile(
    path.join(agentDirectory, `${name}.md`),
    [
      '---',
      `name: ${name}`,
      ...frontmatterLines,
      '---',
      '',
      prompt,
      '',
    ].join('\n'),
    'utf8',
  );
};

const readOverlayAgent = async (overlayDirectory, name) => {
  const content = await fs.readFile(path.join(overlayDirectory, 'agents', `${name}.md`), 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  expect(match).toBeTruthy();
  return {
    content,
    frontmatter: yaml.parse(match[1]) || {},
    prompt: match[2].trim(),
  };
};

const readManifest = async (manifestPath) => JSON.parse(await fs.readFile(manifestPath, 'utf8'));

describe('syncRuntimeAgentOverlays', () => {
  let tempRoot;
  let projectDirectory;
  let packagedAgentDirectory;
  let packagedPluginDirectory;
  let overlayRoot;
  let manifestPath;
  let targetConfigDirectory;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-runtime-agent-overlays-'));
    projectDirectory = path.join(tempRoot, 'project');
    packagedAgentDirectory = path.join(tempRoot, 'packaged-agents');
    packagedPluginDirectory = path.join(tempRoot, 'packaged-plugins');
    overlayRoot = path.join(tempRoot, 'runtime-overlays');
    manifestPath = path.join(overlayRoot, 'manifest.json');
    targetConfigDirectory = path.join(overlayRoot, crypto.createHash('sha256').update(projectDirectory).digest('hex'));
  });

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
    tempRoot = undefined;
  });

  it('writes project agent overlays with user model settings while preserving project prompt and permissions', async () => {
    await writeAgent(path.join(projectDirectory, '.opencode', 'agents'), 'builder', [
      'mode: subagent',
      'model: anthropic/claude-sonnet-4-5',
      'modelRefs:',
      '  - anthropic/claude-sonnet-4-5',
      'variant: low',
      'permission:',
      '  "*": allow',
      '  read:',
      '    "*.env": ask',
    ], 'Project builder prompt');

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {
        builder: {
          model: 'openai/gpt-5.5',
          variant: 'high',
        },
      },
    });

    const overlay = await readOverlayAgent(result.targetConfigDirectory, 'builder');
    expect(result.changed).toBe(true);
    expect(result.written).toEqual(['builder']);
    expect(overlay.frontmatter).toMatchObject({
      name: 'builder',
      mode: 'subagent',
      model: 'openai/gpt-5.5',
      modelRefs: ['openai/gpt-5.5'],
      variant: 'high',
      permission: {
        '*': 'allow',
        read: { '*.env': 'ask' },
      },
    });
    expect(overlay.prompt).toBe('Project builder prompt');
  });

  it('uses an OpenCode-compatible empty variant sentinel to clear inherited project thinking', async () => {
    await writeAgent(path.join(projectDirectory, '.opencode', 'agents'), 'builder', [
      'mode: subagent',
      'model: anthropic/claude-sonnet-4-5',
      'variant: low',
    ], 'Project builder prompt');

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {
        builder: {
          model: 'openai/gpt-5.5',
          variant: null,
        },
      },
    });

    const overlay = await readOverlayAgent(result.targetConfigDirectory, 'builder');
    expect(overlay.frontmatter.model).toBe('openai/gpt-5.5');
    expect(overlay.frontmatter.modelRefs).toEqual(['openai/gpt-5.5']);
    expect(overlay.frontmatter.variant).toBe('');
  });

  it('prefers project prompt over same-name packaged prompt while applying the user model override', async () => {
    await writeAgent(packagedAgentDirectory, 'builder', [
      'mode: subagent',
      'model: packaged/old',
    ], 'Packaged prompt');
    await writeAgent(path.join(projectDirectory, '.opencode', 'agents'), 'builder', [
      'mode: subagent',
      'model: project/old',
    ], 'Project prompt');

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {
        builder: {
          model: 'openai/gpt-5.5',
          variant: 'medium',
        },
      },
    });

    const overlay = await readOverlayAgent(result.targetConfigDirectory, 'builder');
    expect(overlay.frontmatter.model).toBe('openai/gpt-5.5');
    expect(overlay.frontmatter.variant).toBe('medium');
    expect(overlay.prompt).toBe('Project prompt');
  });

  it('writes packaged skill-policy overlays even when the agent has no user model override', async () => {
    await writeAgent(packagedAgentDirectory, 'builder', [
      'mode: subagent',
      'model: packaged/old',
      'permission:',
      '  "*": allow',
      '  external_directory:',
      '    "*": ask',
      '    /tmp/skills/frontend-design/*: allow',
      '    /tmp/skills/debugging/*: allow',
      '  skill:',
      '    frontend-design: allow',
    ], 'Packaged prompt');

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {},
      skillPolicy: {
        skillNames: ['frontend-design', 'project-audit'],
        skillDirectories: [
          '/tmp/skills/frontend-design',
          '/tmp/project/.opencode/skills/project-audit',
        ],
        skillDirectoriesByName: {
          'frontend-design': ['/tmp/skills/frontend-design'],
          'project-audit': ['/tmp/project/.opencode/skills/project-audit'],
        },
      },
    });

    const overlay = await readOverlayAgent(result.targetConfigDirectory, 'builder');
    expect(result.written).toEqual(['builder']);
    expect(overlay.frontmatter.permission.skill).toEqual({
      '*': 'deny',
      'frontend-design': 'allow',
      'project-audit': 'allow',
    });
    expect(overlay.frontmatter.permission.external_directory).toEqual({
      '*': 'ask',
      '/tmp/skills/frontend-design/*': 'allow',
      '/tmp/project/.opencode/skills/project-audit/*': 'allow',
    });
    expect(overlay.prompt).toBe('Packaged prompt');
  });

  it('writes skill-policy overlays for project agents that define skill permissions', async () => {
    await writeAgent(packagedAgentDirectory, 'builder', [
      'mode: subagent',
      'model: packaged/old',
      'permission:',
      '  skill:',
      '    frontend-design: allow',
    ], 'Packaged prompt');
    await writeAgent(path.join(projectDirectory, '.opencode', 'agents'), 'builder', [
      'mode: subagent',
      'model: project/old',
      'permission:',
      '  "*": allow',
      '  external_directory:',
      '    "*": ask',
      '    /tmp/skills/frontend-design/*: allow',
      '    /tmp/skills/debugging/*: allow',
      '  skill:',
      '    frontend-design: allow',
      '    debugging: allow',
    ], 'Project prompt');

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {},
      skillPolicy: {
        skillNames: ['frontend-design'],
        skillDirectories: ['/tmp/skills/frontend-design'],
        skillDirectoriesByName: {
          'frontend-design': ['/tmp/skills/frontend-design'],
        },
      },
    });

    const overlay = await readOverlayAgent(result.targetConfigDirectory, 'builder');
    expect(result.written).toEqual(['builder']);
    expect(overlay.frontmatter.permission.skill).toEqual({
      '*': 'deny',
      'frontend-design': 'allow',
    });
    expect(overlay.frontmatter.permission.external_directory).toEqual({
      '*': 'ask',
      '/tmp/skills/frontend-design/*': 'allow',
    });
    expect(overlay.prompt).toBe('Project prompt');
  });

  it('does not write skill-policy overlays for project agents without skill permissions', async () => {
    await writeAgent(packagedAgentDirectory, 'builder', [
      'mode: subagent',
      'model: packaged/old',
      'permission:',
      '  skill:',
      '    frontend-design: allow',
    ], 'Packaged prompt');
    await writeAgent(path.join(projectDirectory, '.opencode', 'agents'), 'builder', [
      'mode: subagent',
      'model: project/old',
    ], 'Project prompt');

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {},
      skillPolicy: {
        skillNames: ['frontend-design'],
        skillDirectories: ['/tmp/skills/frontend-design'],
        skillDirectoriesByName: {
          'frontend-design': ['/tmp/skills/frontend-design'],
        },
      },
    });

    await expect(fs.stat(path.join(result.targetConfigDirectory, 'agents', 'builder.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(result.written).toEqual([]);
  });

  it('removes stale overlay files after an override reset', async () => {
    await writeAgent(path.join(projectDirectory, '.opencode', 'agents'), 'builder', [
      'mode: subagent',
      'model: project/old',
    ], 'Project prompt');

    await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {
        builder: {
          model: 'openai/gpt-5.5',
          variant: 'medium',
        },
      },
    });

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      agentOverrides: {},
    });

    await expect(fs.stat(path.join(targetConfigDirectory, 'agents', 'builder.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(result.removed).toEqual(['builder']);
    await expect(readManifest(manifestPath)).resolves.toMatchObject({
      projects: {
        [crypto.createHash('sha256').update(projectDirectory).digest('hex')]: {
          agents: {},
        },
      },
    });
  });

  it('writes runtime MCP timeouts for enabled remote MCP servers missing an explicit timeout', async () => {
    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      readConfig: () => ({}),
      listMcpConfigs: () => [
        {
          name: 'slow-remote',
          type: 'remote',
          url: 'https://mcp.example.test/mcp',
          enabled: true,
          scope: 'user',
        },
        {
          name: 'explicit-timeout',
          type: 'remote',
          url: 'https://timeout.example.test/mcp',
          enabled: true,
          timeout: 30_000,
          scope: 'user',
        },
        {
          name: 'disabled-remote',
          type: 'remote',
          url: 'https://disabled.example.test/mcp',
          enabled: false,
          scope: 'user',
        },
        {
          name: 'project-remote',
          type: 'remote',
          url: 'https://project.example.test/mcp',
          enabled: true,
          scope: 'project',
        },
        {
          name: 'local-server',
          type: 'local',
          command: ['node', 'server.js'],
          enabled: true,
        },
      ],
    });

    await expect(fs.readFile(path.join(result.targetConfigDirectory, 'opencode.json'), 'utf8'))
      .resolves.toBe(`${JSON.stringify({
        mcp: {
          'slow-remote': {
            type: 'remote',
            url: 'https://mcp.example.test/mcp',
            enabled: true,
            timeout: 5_000,
          },
        },
      }, null, 2)}\n`);
    expect(result.configWritten).toBe(true);
  });

  it('carries Anthropic OAuth proxy config into the active runtime config while preserving MCP timeout overlays', async () => {
    const activeConfig = {
      plugin: ['opencode-with-claude'],
      provider: {
        anthropic: {
          options: {
            baseURL: 'http://127.0.0.1:3456',
            apiKey: 'dummy',
          },
        },
      },
    };

    await fs.mkdir(path.join(projectDirectory, '.opencode'), { recursive: true });
    await fs.writeFile(
      path.join(projectDirectory, '.opencode', 'opencode.json'),
      `${JSON.stringify(activeConfig, null, 2)}\n`,
      'utf8',
    );

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      readConfig: () => activeConfig,
      listMcpConfigs: () => [
        {
          name: 'slow-remote',
          type: 'remote',
          url: 'https://mcp.example.test/mcp',
          enabled: true,
          scope: 'user',
        },
      ],
    });

    await expect(fs.readFile(path.join(result.targetConfigDirectory, 'opencode.json'), 'utf8')
      .then((content) => JSON.parse(content)))
      .resolves.toEqual({
        mcp: {
          'slow-remote': {
            type: 'remote',
            url: 'https://mcp.example.test/mcp',
            enabled: true,
            timeout: 5_000,
          },
        },
        plugin: ['opencode-with-claude'],
        provider: {
          anthropic: {
            options: {
              baseURL: 'http://127.0.0.1:3456',
              apiKey: 'dummy',
            },
          },
        },
      });
    expect(result.configWritten).toBe(true);
  });

  it('preserves remote MCP OAuth, headers, and environment in timeout overlays', async () => {
    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      readConfig: () => ({}),
      listMcpConfigs: () => [
        {
          name: 'supabase',
          type: 'remote',
          url: 'https://mcp.supabase.com/mcp',
          enabled: true,
          scope: 'user',
          headers: { 'X-Provider': 'supabase' },
          environment: { SUPABASE_PROJECT: 'example' },
          oauth: {
            redirectUri: 'http://localhost:55676/mcp/oauth/callback',
            scope: 'projects:read',
          },
        },
      ],
    });

    await expect(fs.readFile(path.join(result.targetConfigDirectory, 'opencode.json'), 'utf8')
      .then((content) => JSON.parse(content)))
      .resolves.toEqual({
        mcp: {
          supabase: {
            type: 'remote',
            url: 'https://mcp.supabase.com/mcp',
            enabled: true,
            headers: { 'X-Provider': 'supabase' },
            environment: { SUPABASE_PROJECT: 'example' },
            oauth: {
              redirectUri: 'http://localhost:55676/mcp/oauth/callback',
              scope: 'projects:read',
            },
            timeout: 5_000,
          },
        },
      });
  });

  it('removes stale runtime MCP timeout config when no remote MCP needs it', async () => {
    await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      readConfig: () => ({}),
      listMcpConfigs: () => [
        {
          name: 'slow-remote',
          type: 'remote',
          url: 'https://mcp.example.test/mcp',
          enabled: true,
          scope: 'user',
        },
      ],
    });

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      overlayRoot,
      manifestPath,
      readConfig: () => ({}),
      listMcpConfigs: () => [
        {
          name: 'slow-remote',
          type: 'remote',
          url: 'https://mcp.example.test/mcp',
          enabled: true,
          timeout: 10_000,
          scope: 'user',
        },
      ],
    });

    await expect(fs.stat(path.join(result.targetConfigDirectory, 'opencode.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(result.configRemoved).toBe(true);
  });

  it('materializes packaged plugins into the active runtime config directory', async () => {
    await fs.mkdir(packagedPluginDirectory, { recursive: true });
    await fs.writeFile(
      path.join(packagedPluginDirectory, 'council-session.js'),
      'export const CouncilSessionPlugin = async () => ({ tool: { council_session: {} } });\n',
      'utf8',
    );

    const result = await syncRuntimeAgentOverlays({
      workingDirectory: projectDirectory,
      packagedAgentDirectory,
      packagedPluginDirectory,
      overlayRoot,
      manifestPath,
    });

    await expect(fs.readFile(path.join(result.targetConfigDirectory, 'plugins', 'council-session.js'), 'utf8'))
      .resolves.toContain('council_session');
    expect(result.pluginsWritten).toEqual(['council-session.js']);
  });
});
