import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  buildVisibleSkillPolicy,
  filterVisibleSkills,
  sanitizeAgentSkillPolicy,
} from './skill-policy.js';

describe('skill policy', () => {
  it('filters hidden skills by normalized SKILL.md path', () => {
    const visiblePath = path.join('/tmp', 'skills', 'frontend-design', 'SKILL.md');
    const hiddenPath = path.join('/tmp', 'skills', 'debugging', 'SKILL.md');
    const skills = [
      { name: 'frontend-design', path: visiblePath },
      { name: 'debugging', path: hiddenPath },
    ];

    const result = filterVisibleSkills(skills, [
      { name: 'debugging', path: path.join('/tmp', 'skills', 'debugging', '.', 'SKILL.md') },
    ]);

    expect(result.map((skill) => skill.name)).toEqual(['frontend-design']);
  });

  it('deduplicates visible skills by normalized SKILL.md path', () => {
    const skillPath = path.join('/tmp', 'skills', 'debugging', 'SKILL.md');
    const skills = [
      { name: 'debugging', path: skillPath, description: 'Local discovery' },
      { name: 'debugging', path: path.join('/tmp', 'skills', 'debugging', '.', 'SKILL.md'), description: 'Runtime discovery' },
      { name: 'frontend-design', path: path.join('/tmp', 'skills', 'frontend-design', 'SKILL.md') },
    ];

    const result = filterVisibleSkills(skills, []);

    expect(result.map((skill) => `${skill.name}:${skill.description || ''}`)).toEqual([
      'debugging:Local discovery',
      'frontend-design:',
    ]);
  });

  it('hides package-cache skills', () => {
    const skills = [
      {
        name: 'dispatching-parallel-agents',
        path: '/Users/test/.config/opencode/skills/superpowers/dispatching-parallel-agents/SKILL.md',
      },
      {
        name: 'dispatching-parallel-agents',
        path: '/Users/test/.cache/opencode/packages/superpowers/node_modules/superpowers/skills/dispatching-parallel-agents/SKILL.md',
      },
      {
        name: 'cache-only',
        path: '/Users/test/.cache/opencode/packages/example/skills/cache-only/SKILL.md',
      },
    ];

    const result = filterVisibleSkills(skills, []);

    expect(result.map((skill) => skill.path)).toEqual([
      '/Users/test/.config/opencode/skills/superpowers/dispatching-parallel-agents/SKILL.md',
    ]);
  });

  it('normalizes existing symlinked skill paths to their real SKILL.md target', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-policy-realpath-'));
    const realDir = path.join(root, 'real', 'frontend-design');
    const linkDir = path.join(root, 'linked', 'frontend-design');
    fs.mkdirSync(realDir, { recursive: true });
    fs.mkdirSync(path.dirname(linkDir), { recursive: true });
    fs.writeFileSync(path.join(realDir, 'SKILL.md'), '---\nname: frontend-design\n---\n');
    fs.symlinkSync(realDir, linkDir, 'dir');

    const visiblePath = path.join(realDir, 'SKILL.md');
    const linkedPath = path.join(linkDir, 'SKILL.md');

    const result = filterVisibleSkills([
      { name: 'frontend-design', path: visiblePath },
    ], [
      { name: 'frontend-design', path: linkedPath },
    ]);

    expect(result).toEqual([]);
  });

  it('builds an allow policy from visible skills only', () => {
    const skills = [
      { name: 'frontend-design', path: '/tmp/skills/frontend-design/SKILL.md' },
      { name: 'debugging', path: '/tmp/skills/debugging/SKILL.md' },
    ];

    const policy = buildVisibleSkillPolicy({
      skills,
      hiddenSkills: [{ name: 'debugging', path: '/tmp/skills/debugging/SKILL.md' }],
    });

    expect(policy.skillNames).toEqual(['frontend-design']);
    expect(policy.skillDirectories).toEqual(['/tmp/skills/frontend-design']);
  });

  it('excludes hidden global skills from agent skill names and directories', () => {
    const globalSkillPath = path.join('/home/tester', '.config', 'opencode', 'skills', 'lint-helper', 'SKILL.md');
    const visibleSkillPath = path.join('/home/tester', '.agents', 'skills', 'codemap', 'SKILL.md');

    const policy = buildVisibleSkillPolicy({
      skills: [
        { name: 'lint-helper', path: globalSkillPath },
        { name: 'codemap', path: visibleSkillPath },
      ],
      hiddenSkills: [{ name: 'lint-helper', path: globalSkillPath }],
    });

    expect(policy.skillNames).toEqual(['codemap']);
    expect(policy.skillDirectories).toEqual([path.dirname(visibleSkillPath)]);
    expect(policy.skillDirectories).not.toContain(path.dirname(globalSkillPath));
  });

  it('allows every visible skill for skill-capable agents without an explicit wildcard deny', () => {
    const policy = buildVisibleSkillPolicy({
      skills: [
        { name: 'frontend-design', path: '/tmp/skills/frontend-design/SKILL.md' },
        { name: 'project-audit', path: '/tmp/project/.opencode/skills/project-audit/SKILL.md' },
      ],
      hiddenSkills: [],
    });

    const frontmatter = sanitizeAgentSkillPolicy({
      permission: {
        '*': 'allow',
        external_directory: {
          '*': 'ask',
          '/tmp/skills/frontend-design/*': 'allow',
          '/tmp/skills/debugging/*': 'allow',
          '/tmp/scratch/*': 'allow',
        },
        skill: {
          'frontend-design': 'allow',
          debugging: 'allow',
        },
      },
    }, policy);

    expect(frontmatter.permission.skill).toEqual({
      '*': 'deny',
      'frontend-design': 'allow',
      'project-audit': 'allow',
    });
    expect(frontmatter.permission.external_directory).toEqual({
      '*': 'ask',
      '/tmp/scratch/*': 'allow',
      '/tmp/skills/frontend-design/*': 'allow',
      '/tmp/project/.opencode/skills/project-audit/*': 'allow',
    });
  });

  it('keeps explicit wildcard-deny agents restricted to their previous visible allows', () => {
    const policy = buildVisibleSkillPolicy({
      skills: [
        { name: 'codemap', path: '/tmp/skills/codemap/SKILL.md' },
        { name: 'project-audit', path: '/tmp/project/.opencode/skills/project-audit/SKILL.md' },
      ],
      hiddenSkills: [],
    });

    const frontmatter = sanitizeAgentSkillPolicy({
      permission: {
        '*': 'allow',
        skill: {
          '*': 'deny',
          codemap: 'allow',
        },
      },
    }, policy);

    expect(frontmatter.permission.skill).toEqual({
      '*': 'deny',
      codemap: 'allow',
    });
    expect(frontmatter.permission.external_directory).toEqual({
      '/tmp/skills/codemap/*': 'allow',
    });
  });

  it('denies skill use for agents without local skill permission', () => {
    const policy = buildVisibleSkillPolicy({
      skills: [{ name: 'frontend-design', path: '/tmp/skills/frontend-design/SKILL.md' }],
      hiddenSkills: [],
    });

    const frontmatter = sanitizeAgentSkillPolicy({
      permission: {
        '*': 'allow',
      },
    }, policy);

    expect(frontmatter.permission.skill).toEqual({ '*': 'deny' });
  });
});
