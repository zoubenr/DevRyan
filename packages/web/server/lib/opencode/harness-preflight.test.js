import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  auditPackagedPromptContext,
  createHarnessPreflight,
  lintAgentHarness,
  registerHarnessPreflightRoute,
} from './harness-preflight.js';

describe('harness preflight', () => {
  it('reports read-only findings for unavailable delegated agents and invalid permission keys', () => {
    const findings = lintAgentHarness({
      agents: [
        {
          name: 'orchestrator',
          path: '/agents/orchestrator.md',
          frontmatter: {
            permission: {
              task: { explorer: 'allow', missing: 'allow' },
              edit: 'allow',
              unknown_tool: 'allow',
            },
          },
        },
        {
          name: 'explorer',
          path: '/agents/explorer.md',
          frontmatter: { permission: { read: 'allow' } },
        },
      ],
      skills: [],
      hiddenSkills: [],
      staleOverrides: [],
      toolManifest: {
        aliases: {
          edit: ['edit', 'write', 'patch'],
          read: ['read'],
          task: ['task'],
          skill: ['skill'],
        },
      },
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        summary: expect.stringContaining('missing'),
        artifact: expect.objectContaining({ path: '/agents/orchestrator.md' }),
        stopCondition: expect.stringContaining('missing'),
      }),
      expect.objectContaining({
        severity: 'warning',
        summary: expect.stringContaining('unknown_tool'),
        artifact: expect.objectContaining({ path: '/agents/orchestrator.md' }),
      }),
    ]));
  });

  it('reports hidden allowed skills, stale overrides, duplicate skill names, malformed skills, and warmup state', () => {
    const findings = lintAgentHarness({
      agents: [
        {
          name: 'builder',
          path: '/agents/builder.md',
          frontmatter: { permission: { skill: { hidden: 'allow' } } },
        },
      ],
      skills: [
        { name: 'hidden', path: '/skills/hidden/SKILL.md', parseOk: true },
        { name: 'duplicate', path: '/skills/a/SKILL.md', parseOk: true },
        { name: 'duplicate', path: '/skills/b/SKILL.md', parseOk: true },
        { name: '', path: '/skills/bad/SKILL.md', parseOk: false, error: 'frontmatter parse failed' },
      ],
      hiddenSkills: [{ name: 'hidden', path: '/skills/hidden/SKILL.md' }],
      staleOverrides: ['removed-agent'],
      latestWarmup: {
        timestamp: 1,
        directory: '/repo',
        timedOut: true,
        errors: [{ name: 'mcp', status: 'timeout', error: 'Timed out' }],
      },
      toolManifest: { aliases: { skill: ['skill'] } },
    });

    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      'hidden-skill-allowed',
      'stale-model-override',
      'duplicate-skill-name',
      'malformed-skill-frontmatter',
      'warmup-timeout',
    ]));
  });

  it('audits packaged prompt context budget without changing content', () => {
    const content = [
      'Use only tools that the runtime exposes.',
      'Use only tools that the runtime exposes.',
      'Route unknown codebase discovery to explorer.',
    ].join('\n');
    const agents = [{ name: 'builder', path: '/agents/builder.md', content }];

    const report = auditPackagedPromptContext({ agents });

    expect(agents[0].content).toBe(content);
    expect(report).toEqual([
      expect.objectContaining({
        agent: 'builder',
        path: '/agents/builder.md',
        byteCount: Buffer.byteLength(content, 'utf8'),
        repeatedRoutingRules: expect.any(Number),
        duplicatedToolSafetyText: expect.any(Number),
        candidates: expect.arrayContaining([
          expect.objectContaining({ classification: 'needs-human-review' }),
        ]),
      }),
    ]);
  });

  it('combines diagnostics, manifest, findings, and read-only audit in a preflight result', () => {
    const preflight = createHarnessPreflight({
      getAgents: () => [],
      getSkills: () => [],
      getHiddenSkills: () => [],
      getStaleOverrides: () => [],
      getLatestWarmup: () => null,
      getToolManifest: () => ({ tools: [], aliases: {}, sourceRuntime: 'web', directory: '/repo' }),
      getPackagedAgents: () => [{ name: 'builder', path: '/agents/builder.md', content: 'short prompt' }],
    });

    const result = preflight.run({ directory: '/repo' });

    expect(result.ok).toBe(true);
    expect(result.directory).toBe('/repo');
    expect(result.findings).toEqual([]);
    expect(result.toolManifest).toEqual(expect.objectContaining({ sourceRuntime: 'web' }));
    expect(result.promptAudit[0]).toEqual(expect.objectContaining({
      agent: 'builder',
      classification: expect.any(String),
    }));
    expect(result.harness).toEqual(expect.objectContaining({
      status: 'success',
      summary: 'Harness preflight completed with 0 findings',
    }));
  });

  it('returns a harness error envelope when preflight dependencies fail', async () => {
    const app = express();
    app.use(express.json());
    registerHarnessPreflightRoute(app, {
      run: async () => {
        throw new Error('skill metadata failed');
      },
    });

    const response = await request(app)
      .get('/api/diagnostics/harness/preflight')
      .query({ directory: '/repo' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(expect.objectContaining({
      ok: false,
      directory: '/repo',
      error: {
        kind: 'preflightFailed',
        message: 'skill metadata failed',
      },
      harness: expect.objectContaining({
        status: 'error',
        summary: 'Harness preflight failed',
      }),
    }));
  });
});
