import {
  createHarnessError,
  createHarnessSuccess,
  createHarnessWarning,
  withHarnessResult,
} from './harness-result.js';

const KNOWN_PERMISSION_KEYS = new Set([
  '*',
  'ask',
  'bash',
  'clarification',
  'clarification_*',
  'context7_*',
  'council_session',
  'doom_loop',
  'edit',
  'external_directory',
  'grep_app_*',
  'input',
  'patch',
  'plan_enter',
  'plan_exit',
  'question',
  'question_*',
  'read',
  'skill',
  'task',
  'websearch_*',
  'write',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function maybePromise(value) {
  return value && typeof value.then === 'function';
}

function normalizePath(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getAgentFrontmatter(agent) {
  if (!isObject(agent)) return {};
  return isObject(agent.frontmatter) ? agent.frontmatter : agent;
}

function getAgentPath(agent) {
  return normalizePath(agent?.path) || normalizePath(agent?.sourcePath);
}

function getAgentName(agent) {
  return typeof agent?.name === 'string' && agent.name.trim() ? agent.name.trim() : '(unnamed)';
}

function isAllowedPermissionValue(value) {
  return value === 'allow' || value === true;
}

function createFinding({
  ruleId,
  severity = 'warning',
  summary,
  artifact,
  suggestedNextAction,
  stopCondition,
}) {
  return {
    ruleId,
    severity,
    summary,
    artifact,
    suggestedNextAction,
    stopCondition,
  };
}

function buildPermissionKeySet(toolManifest) {
  const keys = new Set(KNOWN_PERMISSION_KEYS);
  const aliases = isObject(toolManifest?.aliases) ? toolManifest.aliases : {};
  for (const [key, values] of Object.entries(aliases)) {
    keys.add(key);
    for (const value of asArray(values)) {
      if (typeof value === 'string' && value.trim()) keys.add(value.trim());
    }
  }
  for (const tool of asArray(toolManifest?.tools)) {
    if (typeof tool?.id === 'string' && tool.id.trim()) keys.add(tool.id.trim());
    for (const alias of asArray(tool?.aliases)) {
      if (typeof alias === 'string' && alias.trim()) keys.add(alias.trim());
    }
  }
  return keys;
}

function lintDelegatedAgents({ findings, agentsByName, agent }) {
  const frontmatter = getAgentFrontmatter(agent);
  const taskPermissions = frontmatter.permission?.task;
  if (!isObject(taskPermissions)) return;

  for (const [delegatedName, value] of Object.entries(taskPermissions)) {
    if (delegatedName === '*' || !isAllowedPermissionValue(value)) continue;
    if (agentsByName.has(delegatedName)) continue;
    findings.push(createFinding({
      ruleId: 'unavailable-delegated-agent',
      severity: 'error',
      summary: `Agent "${getAgentName(agent)}" allows unavailable delegated agent "${delegatedName}"`,
      artifact: { type: 'agent', name: getAgentName(agent), path: getAgentPath(agent) },
      suggestedNextAction: `Remove "${delegatedName}" from permission.task or add a matching agent`,
      stopCondition: `Stop delegation to "${delegatedName}" until an agent with that name exists`,
    }));
  }
}

function lintPermissionKeys({ findings, permissionKeys, agent }) {
  const frontmatter = getAgentFrontmatter(agent);
  const permissions = frontmatter.permission;
  if (!isObject(permissions)) return;

  for (const key of Object.keys(permissions)) {
    if (permissionKeys.has(key)) continue;
    findings.push(createFinding({
      ruleId: 'invalid-permission-key',
      severity: 'warning',
      summary: `Agent "${getAgentName(agent)}" uses unknown permission key "${key}"`,
      artifact: { type: 'agent', name: getAgentName(agent), path: getAgentPath(agent) },
      suggestedNextAction: `Check whether "${key}" should be a runtime tool ID, alias, or removed permission`,
      stopCondition: `Stop relying on "${key}" until it appears in the tool manifest or documented permission keys`,
    }));
  }
}

function lintHiddenSkillAllows({ findings, hiddenSkills, agent }) {
  const frontmatter = getAgentFrontmatter(agent);
  const skillPermissions = frontmatter.permission?.skill;
  if (!isObject(skillPermissions)) return;

  const hiddenNames = new Set(hiddenSkills.map((skill) => skill?.name).filter(Boolean));
  const hiddenPaths = new Set(hiddenSkills.map((skill) => normalizePath(skill?.path)).filter(Boolean));

  for (const [skillName, value] of Object.entries(skillPermissions)) {
    if (!isAllowedPermissionValue(value)) continue;
    if (!hiddenNames.has(skillName) && !hiddenPaths.has(skillName)) continue;
    findings.push(createFinding({
      ruleId: 'hidden-skill-allowed',
      severity: 'warning',
      summary: `Agent "${getAgentName(agent)}" still allows hidden skill "${skillName}"`,
      artifact: { type: 'agent', name: getAgentName(agent), path: getAgentPath(agent) },
      suggestedNextAction: `Remove "${skillName}" from the agent skill allow list or unhide the skill`,
      stopCondition: `Stop assuming "${skillName}" can be loaded while it remains hidden`,
    }));
  }
}

function lintSkills({ findings, skills }) {
  const byName = new Map();

  for (const skill of skills) {
    const name = typeof skill?.name === 'string' ? skill.name.trim() : '';
    const skillPath = normalizePath(skill?.path);
    if (skill?.parseOk === false || !name) {
      findings.push(createFinding({
        ruleId: 'malformed-skill-frontmatter',
        severity: 'error',
        summary: `Skill frontmatter is malformed${skillPath ? ` at ${skillPath}` : ''}`,
        artifact: { type: 'skill', name: name || '(unnamed)', path: skillPath },
        suggestedNextAction: skill?.error || 'Fix SKILL.md frontmatter so it contains a valid name',
        stopCondition: 'Stop exposing this skill until its frontmatter parses cleanly',
      }));
      continue;
    }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(skillPath);
  }

  for (const [name, paths] of byName.entries()) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (uniquePaths.length < 2) continue;
    findings.push(createFinding({
      ruleId: 'duplicate-skill-name',
      severity: 'warning',
      summary: `Skill name "${name}" appears in multiple paths`,
      artifact: { type: 'skill', name, path: uniquePaths[0], paths: uniquePaths },
      suggestedNextAction: 'Rename or hide duplicate skills so agent skill permissions resolve predictably',
      stopCondition: `Stop relying on skill "${name}" until one canonical path is selected`,
    }));
  }
}

function lintStaleOverrides({ findings, staleOverrides }) {
  for (const agentName of staleOverrides) {
    findings.push(createFinding({
      ruleId: 'stale-model-override',
      severity: 'warning',
      summary: `Model override exists for missing agent "${agentName}"`,
      artifact: { type: 'agent-override', name: agentName },
      suggestedNextAction: 'Remove the stale override or restore the agent',
      stopCondition: `Stop expecting override "${agentName}" to affect runtime behavior until the agent exists`,
    }));
  }
}

function lintWarmup({ findings, latestWarmup }) {
  if (!latestWarmup) return;
  if (latestWarmup.timedOut) {
    findings.push(createFinding({
      ruleId: 'warmup-timeout',
      severity: 'warning',
      summary: 'Latest agent runtime warmup reported a timeout',
      artifact: { type: 'warmup', name: latestWarmup.directory || 'global' },
      suggestedNextAction: 'Review the timed-out warmup task before starting latency-sensitive agent work',
      stopCondition: 'Stop retrying warmup if OpenCode stays unavailable after restart',
    }));
  }
  for (const error of asArray(latestWarmup.errors)) {
    findings.push(createFinding({
      ruleId: 'warmup-task-error',
      severity: error.status === 'timeout' ? 'warning' : 'error',
      summary: `Warmup task "${error.name}" reported ${error.status}`,
      artifact: { type: 'warmup-task', name: error.name },
      suggestedNextAction: error.error || 'Inspect the latest warmup diagnostics',
      stopCondition: `Stop relying on task "${error.name}" readiness until the next warmup succeeds`,
    }));
  }
}

function lintAgentHarness(options = {}) {
  const agents = asArray(options.agents);
  const skills = asArray(options.skills);
  const hiddenSkills = asArray(options.hiddenSkills);
  const staleOverrides = asArray(options.staleOverrides);
  const agentsByName = new Set(agents.map(getAgentName));
  const permissionKeys = buildPermissionKeySet(options.toolManifest);
  const findings = [];

  for (const agent of agents) {
    lintDelegatedAgents({ findings, agentsByName, agent });
    lintPermissionKeys({ findings, permissionKeys, agent });
    lintHiddenSkillAllows({ findings, hiddenSkills, agent });
  }
  lintSkills({ findings, skills });
  lintStaleOverrides({ findings, staleOverrides });
  lintWarmup({ findings, latestWarmup: options.latestWarmup });

  return findings;
}

function countDuplicateLines(lines, predicate) {
  const counts = new Map();
  for (const line of lines) {
    const normalized = line.trim().replace(/\s+/g, ' ');
    if (!normalized || !predicate(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function classifyAudit(candidates) {
  if (candidates.some((candidate) => candidate.classification === 'do-not-touch')) {
    return 'do-not-touch';
  }
  if (candidates.some((candidate) => candidate.classification === 'needs-human-review')) {
    return 'needs-human-review';
  }
  if (candidates.some((candidate) => candidate.classification === 'safe-to-extract')) {
    return 'safe-to-extract';
  }
  return 'do-not-touch';
}

function auditPackagedPromptContext(options = {}) {
  return asArray(options.agents).map((agent) => {
    const content = typeof agent?.content === 'string'
      ? agent.content
      : `${typeof agent?.prompt === 'string' ? agent.prompt : ''}`;
    const lines = content.split(/\r?\n/);
    const repeatedRoutingRules = countDuplicateLines(lines, (line) => /route|delegat|agent|explorer/i.test(line));
    const duplicatedToolSafetyText = countDuplicateLines(lines, (line) => /tool|permission|runtime exposes/i.test(line));
    const candidates = [];

    if (duplicatedToolSafetyText > 0 || repeatedRoutingRules > 0) {
      candidates.push({
        classification: 'needs-human-review',
        summary: 'Repeated routing or tool-safety guidance could potentially move into a skill',
      });
    }
    if (Buffer.byteLength(content, 'utf8') > 16_000) {
      candidates.push({
        classification: 'safe-to-extract',
        summary: 'Prompt is large enough to audit for skill extraction candidates',
      });
    }
    if (/plan_enter|plan_exit|permission:|modelRefs:/i.test(content)) {
      candidates.push({
        classification: 'do-not-touch',
        summary: 'Prompt contains frontmatter, permission, or plan-mode sentinel requirements',
      });
    }
    if (candidates.length === 0) {
      candidates.push({
        classification: 'do-not-touch',
        summary: 'No safe extraction candidate detected',
      });
    }

    return {
      agent: getAgentName(agent),
      path: getAgentPath(agent),
      byteCount: Buffer.byteLength(content, 'utf8'),
      repeatedRoutingRules,
      duplicatedToolSafetyText,
      guidanceCandidates: candidates.length,
      classification: classifyAudit(candidates),
      candidates,
    };
  });
}

function buildPreflightResult({
  directory,
  agents,
  skills,
  hiddenSkills,
  staleOverrides,
  latestWarmup,
  toolManifest,
  packagedAgents,
}) {
  const findings = lintAgentHarness({
    agents,
    skills,
    hiddenSkills,
    staleOverrides,
    latestWarmup,
    toolManifest,
  });
  const promptAudit = auditPackagedPromptContext({ agents: packagedAgents });
  const harness = findings.length > 0
    ? createHarnessWarning({
      summary: `Harness preflight completed with ${findings.length} finding${findings.length === 1 ? '' : 's'}`,
      nextActions: ['Review findings before relying on agent delegation or hidden skills'],
      artifacts: [
        ...findings.map((finding) => finding.artifact?.path).filter(Boolean),
        ...promptAudit.map((entry) => entry.path).filter(Boolean),
      ],
      recovery: {
        rootCauseHint: 'One or more harness contracts may be stale or unavailable',
        safeRetry: 'Retry preflight after updating agent permissions, skills, or runtime tools',
        stopCondition: 'Stop when preflight still reports error severity findings',
        retryable: true,
      },
    })
    : createHarnessSuccess({
      summary: 'Harness preflight completed with 0 findings',
      nextActions: [],
      artifacts: promptAudit.map((entry) => entry.path).filter(Boolean),
    });

  return withHarnessResult({
    ok: true,
    directory: directory || null,
    findings,
    toolManifest,
    latestWarmup,
    promptAudit,
  }, harness);
}

function createHarnessPreflight(dependencies = {}) {
  const read = (name, context) => (
    typeof dependencies[name] === 'function' ? dependencies[name](context) : []
  );

  return {
    run(context = {}) {
      const values = {
        agents: read('getAgents', context),
        skills: read('getSkills', context),
        hiddenSkills: read('getHiddenSkills', context),
        staleOverrides: read('getStaleOverrides', context),
        latestWarmup: typeof dependencies.getLatestWarmup === 'function' ? dependencies.getLatestWarmup(context) : null,
        toolManifest: typeof dependencies.getToolManifest === 'function' ? dependencies.getToolManifest(context) : { tools: [], aliases: {}, sourceRuntime: 'server', directory: context.directory || null },
        packagedAgents: read('getPackagedAgents', context),
      };

      const pending = Object.entries(values).filter(([, value]) => maybePromise(value));
      if (pending.length === 0) {
        return buildPreflightResult({ directory: context.directory, ...values });
      }

      return Promise.all(pending.map(([, value]) => value)).then((resolved) => {
        const nextValues = { ...values };
        pending.forEach(([key], index) => {
          nextValues[key] = resolved[index];
        });
        return buildPreflightResult({ directory: context.directory, ...nextValues });
      });
    },
  };
}

function registerHarnessPreflightRoute(app, preflight) {
  const handle = async (req, res) => {
    const directory = typeof req.query?.directory === 'string'
      ? req.query.directory
      : (typeof req.body?.directory === 'string' ? req.body.directory : undefined);
    try {
      const result = await preflight.run({ directory });
      res.json(result);
    } catch (error) {
      const message = formatErrorMessage(error, 'Harness preflight failed');
      res.status(500).json(withHarnessResult({
        ok: false,
        directory: directory || null,
        error: {
          kind: 'preflightFailed',
          message,
        },
      }, createHarnessError({
        summary: 'Harness preflight failed',
        nextActions: ['Fix the reported preflight dependency failure and retry'],
        recovery: {
          rootCauseHint: message,
          safeRetry: 'Retry preflight after agent, skill, or runtime metadata can be read',
          stopCondition: 'Stop retrying if the same preflight dependency keeps failing',
          retryable: true,
        },
      })));
    }
  };

  app.get('/api/diagnostics/harness/preflight', handle);
  app.post('/api/diagnostics/harness/preflight', handle);
}

export {
  auditPackagedPromptContext,
  createHarnessPreflight,
  lintAgentHarness,
  registerHarnessPreflightRoute,
};
