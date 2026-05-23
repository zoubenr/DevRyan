import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getAgentConfig,
  listConfigAgents,
  writeAgentModelOverride,
} from './agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../..');

const writeProjectAgent = async (projectDirectory, name, frontmatterLines) => {
  const agentDirectory = path.join(projectDirectory, '.opencode', 'agents');
  await fs.mkdir(agentDirectory, { recursive: true });
  await fs.writeFile(
    path.join(agentDirectory, `${name}.md`),
    [
      '---',
      ...frontmatterLines,
      '---',
      '',
      `${name} prompt`,
      '',
    ].join('\n'),
    'utf8',
  );
};

describe('agent model overrides', () => {
  let tempRoot;
  let projectDirectory;
  let userConfigPath;

  beforeEach(async () => {
    await fs.mkdir(path.join(repoRoot, '.cache'), { recursive: true });
    tempRoot = await fs.mkdtemp(path.join(repoRoot, '.cache', 'agent-model-overrides-'));
    projectDirectory = path.join(tempRoot, 'project');
    userConfigPath = path.join(tempRoot, 'opencode-config', 'config.json');
    await fs.mkdir(path.dirname(userConfigPath), { recursive: true });
  });

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
    tempRoot = undefined;
  });

  it('replaces markdown modelRefs when applying a saved scalar model override', async () => {
    await writeProjectAgent(projectDirectory, 'builder', [
      'mode: primary',
      'model: anthropic/claude-sonnet-4-5',
      'modelRefs:',
      '  - anthropic/claude-sonnet-4-5',
      'variant: low',
    ]);

    writeAgentModelOverride(
      'builder',
      { model: 'openai/gpt-5.5', variant: 'high' },
      projectDirectory,
      { userConfigPath },
    );

    const config = getAgentConfig('builder', projectDirectory, { userConfigPath }).config;
    const listed = listConfigAgents(projectDirectory, { userConfigPath }).find((agent) => agent.name === 'builder');

    expect(config.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(config.modelRefs).toEqual(['openai/gpt-5.5']);
    expect(config.variant).toBe('high');
    expect(listed?.modelRefs).toEqual(['openai/gpt-5.5']);
  });

  it('clears an inherited thinking variant when the override variant is null', async () => {
    await writeProjectAgent(projectDirectory, 'builder', [
      'mode: primary',
      'model: anthropic/claude-sonnet-4-5',
      'variant: low',
    ]);

    writeAgentModelOverride(
      'builder',
      { model: 'openai/gpt-5.5', variant: null },
      projectDirectory,
      { userConfigPath },
    );

    const config = getAgentConfig('builder', projectDirectory, { userConfigPath }).config;

    expect(config.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(config.modelRefs).toEqual(['openai/gpt-5.5']);
    expect(config.variant).toBeUndefined();
  });

  it('preserves ordered Council councillor modelRefs while keeping the scalar model as synthesizer', async () => {
    await writeProjectAgent(projectDirectory, 'council', [
      'mode: all',
      'model: anthropic/claude-sonnet-4-5',
      'modelRefs:',
      '  - anthropic/claude-sonnet-4-5',
      'variant: low',
    ]);

    writeAgentModelOverride(
      'council',
      {
        model: 'openai/gpt-5.5',
        variant: 'medium',
        councillors: [
          { model: 'openai/gpt-5.3-codex', variant: 'high' },
          { model: 'opencode-go/kimi-k2.6', variant: null },
        ],
      },
      projectDirectory,
      { userConfigPath },
    );

    const config = getAgentConfig('council', projectDirectory, { userConfigPath }).config;

    expect(config.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(config.variant).toBe('medium');
    expect(config.councillors).toEqual([
      { model: 'openai/gpt-5.3-codex', variant: 'high' },
      { model: 'opencode-go/kimi-k2.6', variant: null },
    ]);
    expect(config.modelRefs).toEqual([
      'openai/gpt-5.3-codex',
      'opencode-go/kimi-k2.6',
    ]);
  });
});
