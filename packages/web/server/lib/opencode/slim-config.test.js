import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseJsonc } from 'jsonc-parser';

import {
  resolveSlimConfig,
  writeSlimAgentModelOverride,
} from './slim-config.js';

const writeJson = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const writeJsonc = async (filePath, content) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

const readJsonc = async (filePath) => parseJsonc(await fs.readFile(filePath, 'utf8'), [], { allowTrailingComma: true });

describe('oh-my-opencode-slim config adapter', () => {
  let tempRoot;
  let configDirectory;
  let projectDirectory;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devryan-slim-config-'));
    configDirectory = path.join(tempRoot, 'opencode-config');
    projectDirectory = path.join(tempRoot, 'project');
  });

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
    tempRoot = undefined;
  });

  it('merges active presets with user and project root agent overrides', async () => {
    await writeJsonc(path.join(configDirectory, 'oh-my-opencode-slim.jsonc'), `{
      // jsonc should be accepted
      "preset": "openai",
      "presets": {
        "openai": {
          "orchestrator": { "model": "openai/gpt-5.5", "variant": "medium", "skills": ["*"], "mcps": ["*", "!context7"] },
          "designer": { "model": "openai/gpt-5.4-mini", "variant": "medium", "skills": [], "mcps": [] },
          "fixer": { "model": "openai/gpt-5.5", "variant": "low", "skills": [], "mcps": [] },
          "observer": { "model": "openai/gpt-5.4-mini" }
        }
      },
      "agents": {
        "designer": { "model": "openai/gpt-5.5", "variant": "high", "skills": ["simplify"], "mcps": ["websearch"] }
      },
      "disabled_agents": ["observer"],
    }`);
    await writeJson(path.join(projectDirectory, '.opencode', 'oh-my-opencode-slim.json'), {
      agents: {
        fixer: { variant: 'high', mcps: ['context7'] },
      },
    });

    const resolved = resolveSlimConfig(projectDirectory, { configDirectory });

    expect(resolved.activePreset).toBe('openai');
    expect(resolved.agentNames).toEqual(['designer', 'fixer', 'orchestrator']);
    expect(resolved.agents.designer).toMatchObject({
      model: { providerID: 'openai', modelID: 'gpt-5.5' },
      modelRefs: ['openai/gpt-5.5'],
      variant: 'high',
      skills: ['simplify'],
      mcps: ['websearch'],
    });
    expect(resolved.agents.fixer).toMatchObject({
      model: { providerID: 'openai', modelID: 'gpt-5.5' },
      modelRefs: ['openai/gpt-5.5'],
      variant: 'high',
      mcps: ['context7'],
    });
    expect(resolved.agents.orchestrator).toMatchObject({
      model: { providerID: 'openai', modelID: 'gpt-5.5' },
      modelRefs: ['openai/gpt-5.5'],
      variant: 'medium',
      skills: ['*'],
    });
    expect(resolved.agents.observer).toBeUndefined();
  });

  it('writes model overrides to root agents while preserving Slim-owned fields and deleting cleared variants', async () => {
    const slimConfigPath = path.join(configDirectory, 'oh-my-opencode-slim.jsonc');
    await writeJson(slimConfigPath, {
      preset: 'openai',
      presets: {
        openai: {
          oracle: { model: 'openai/gpt-5.5', variant: 'high', skills: ['simplify'], mcps: [] },
        },
      },
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          variant: 'high',
          skills: ['simplify'],
          mcps: ['websearch'],
          prompt: 'Keep the Slim prompt override.',
        },
      },
    });

    const override = writeSlimAgentModelOverride('oracle', {
      model: 'openai/gpt-5.4-mini',
      variant: null,
    }, { configDirectory });

    await expect(readJsonc(slimConfigPath)).resolves.toMatchObject({
      agents: {
        oracle: {
          model: 'openai/gpt-5.4-mini',
          skills: ['simplify'],
          mcps: ['websearch'],
          prompt: 'Keep the Slim prompt override.',
        },
      },
    });
    const written = await readJsonc(slimConfigPath);
    expect(written.agents.oracle).not.toHaveProperty('variant');
    expect(override).toEqual({ model: 'openai/gpt-5.4-mini', variant: null });
  });
});
