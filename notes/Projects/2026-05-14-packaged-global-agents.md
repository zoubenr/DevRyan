# Packaged Global Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DevRyan primary and subagents available in every project, with their source `.md` definitions hosted inside the packaged application instead of only the DevRyan repository root.

**Architecture:** Add package-owned default agent assets under `@openchamber/web`, sync those assets into OpenCode's user-level agent directory before managed OpenCode starts, and update Settings/Agents listing to show global agents alongside project overrides. Project agents remain higher precedence; packaged defaults become the seed source for global user agents so OpenCode's `/agent` endpoint and the UI agree across web, Electron, and VS Code.

**Tech Stack:** Bun, Node fs/path APIs, Express route modules in `packages/web/server/lib/opencode`, duplicated VS Code config runtime in `packages/vscode/src/opencodeConfig.ts`, Vitest.

---

## Files

- Create: `packages/web/server/default-config/agents/builder.md`
- Create: `packages/web/server/default-config/agents/orchestrator.md`
- Create: `packages/web/server/default-config/agents/plan.md`
- Create: `packages/web/server/default-config/agents/explorer.md`
- Create: `packages/web/server/default-config/agents/fixer.md`
- Create: `packages/web/server/default-config/agents/designer.md`
- Create: `packages/web/server/default-config/agents/oracle.md`
- Create: `packages/web/server/default-config/agents/librarian.md`
- Create: `packages/web/server/default-config/agents/council.md`
- Create: `packages/web/server/default-config/opencode.json`
- Create: `packages/web/server/lib/opencode/packaged-agents.js`
- Modify: `packages/web/server/lib/opencode/agents.js`
- Modify: `packages/web/server/lib/opencode/config-entity-routes.js`
- Modify: `packages/web/server/lib/opencode/index.js`
- Modify: `packages/web/server/lib/opencode/lifecycle.js`
- Modify: `packages/web/package.json`
- Modify: `packages/vscode/src/opencodeConfig.ts`
- Modify: `packages/vscode/src/opencode.ts`
- Test: `packages/web/server/opencode-agents.test.js`
- Test: add focused VS Code parity tests only if an existing VS Code test harness already covers `opencodeConfig.ts`; otherwise verify via `bun run vscode:type-check`.

## Task 1: Package The DevRyan Agent Defaults

**Files:**
- Create files under `packages/web/server/default-config/agents/`
- Create `packages/web/server/default-config/opencode.json`
- Modify `packages/web/package.json`

- [ ] **Step 1: Copy the current repo-root agent definitions into package assets**

Copy each `.opencode/agents/*.md` file into `packages/web/server/default-config/agents/`, excluding backup files such as `council.md.backup-*`.

Use the same filenames:

```txt
builder.md
orchestrator.md
plan.md
explorer.md
fixer.md
designer.md
oracle.md
librarian.md
council.md
```

- [ ] **Step 2: Copy the agent-related OpenCode config into package assets**

Create `packages/web/server/default-config/opencode.json` with only the app-owned defaults needed globally:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "explore": {
      "disable": true
    },
    "general": {
      "disable": true
    }
  },
  "plugin": [
    "opencode-with-claude",
    "superpowers@git+https://github.com/obra/superpowers.git"
  ]
}
```

Do not include project-only MCP servers from the repo root `.opencode/opencode.json` unless the user explicitly asks to globalize them. This request is about agents.

- [ ] **Step 3: Ensure package publishing includes the assets**

In `packages/web/package.json`, keep `"server"` in `files`; no new package entry is required if the assets live under `server/default-config`. Verify this by running:

```bash
bun pm pack --cwd packages/web
```

Expected: the tarball file list includes `server/default-config/agents/*.md` and `server/default-config/opencode.json`.

## Task 2: Add A Packaged-Agent Sync Module

**Files:**
- Create `packages/web/server/lib/opencode/packaged-agents.js`
- Modify `packages/web/server/lib/opencode/index.js`
- Test: `packages/web/server/opencode-agents.test.js`

- [ ] **Step 1: Write failing tests for package asset discovery and non-destructive sync**

Append tests to `packages/web/server/opencode-agents.test.js` that use a temp OpenCode config dir override. The assertions should cover:

```js
import {
  listPackagedAgents,
  syncPackagedAgentsToUserConfig,
} from './lib/opencode/packaged-agents.js';

it('discovers packaged default agents from server/default-config', () => {
  const agents = listPackagedAgents();
  expect(agents.map((agent) => agent.name)).toEqual(expect.arrayContaining([
    'builder',
    'orchestrator',
    'plan',
    'explorer',
    'fixer',
    'designer',
    'oracle',
    'librarian',
    'council',
  ]));
});

it('syncs packaged agents without overwriting user-edited files', async () => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-packaged-agents-'));
  await syncPackagedAgentsToUserConfig({ configDir });
  const builderPath = path.join(configDir, 'agents', 'builder.md');
  await fs.writeFile(builderPath, 'user edit', 'utf8');
  await syncPackagedAgentsToUserConfig({ configDir });
  await expect(fs.readFile(builderPath, 'utf8')).resolves.toBe('user edit');
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run:

```bash
bun run --cwd packages/web test -- opencode-agents.test.js
```

Expected: FAIL because `packaged-agents.js` does not exist.

- [ ] **Step 3: Implement package discovery and sync**

Create `packages/web/server/lib/opencode/packaged-agents.js` with these responsibilities:

```js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseMdFile, writeConfig, readConfigFile } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = path.resolve(__dirname, '../../default-config');
const DEFAULT_AGENT_DIR = path.join(DEFAULT_CONFIG_DIR, 'agents');
const DEFAULT_OPENCODE_CONFIG = path.join(DEFAULT_CONFIG_DIR, 'opencode.json');
const SYNC_STATE_DIR = '.openchamber';
const SYNC_STATE_FILE = 'packaged-agents.json';

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex');

export function listPackagedAgents() {
  if (!fs.existsSync(DEFAULT_AGENT_DIR)) return [];
  return fs.readdirSync(DEFAULT_AGENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const filePath = path.join(DEFAULT_AGENT_DIR, entry.name);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseMdFile(filePath);
      return {
        name: entry.name.slice(0, -3),
        path: filePath,
        content,
        hash: sha256(content),
        frontmatter,
        prompt: body,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function syncPackagedAgentsToUserConfig(options = {}) {
  const configDir = options.configDir || path.join(process.env.HOME || '', '.config', 'opencode');
  const targetAgentDir = path.join(configDir, 'agents');
  const stateDir = path.join(configDir, SYNC_STATE_DIR);
  const statePath = path.join(stateDir, SYNC_STATE_FILE);
  const previousState = fs.existsSync(statePath) ? readConfigFile(statePath) : {};
  const previousAgents = previousState.agents || {};
  const nextAgents = {};

  fs.mkdirSync(targetAgentDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  for (const agent of listPackagedAgents()) {
    const targetPath = path.join(targetAgentDir, `${agent.name}.md`);
    const previous = previousAgents[agent.name];
    const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;
    const currentHash = currentContent == null ? null : sha256(currentContent);
    const canWrite = currentContent == null || currentHash === previous?.hash;
    if (canWrite) {
      fs.writeFileSync(targetPath, agent.content, 'utf8');
    }
    nextAgents[agent.name] = { hash: agent.hash };
  }

  if (fs.existsSync(DEFAULT_OPENCODE_CONFIG)) {
    const defaultConfig = readConfigFile(DEFAULT_OPENCODE_CONFIG);
    const userConfigPath = path.join(configDir, 'config.json');
    const userConfig = fs.existsSync(userConfigPath) ? readConfigFile(userConfigPath) : {};
    const merged = {
      ...userConfig,
      agent: { ...(defaultConfig.agent || {}), ...(userConfig.agent || {}) },
      plugin: Array.from(new Set([...(defaultConfig.plugin || []), ...(userConfig.plugin || [])])),
    };
    writeConfig(merged, userConfigPath);
  }

  writeConfig({ version: 1, agents: nextAgents }, statePath);
}
```

The implementation may refine `configDir` resolution by reusing `OPENCODE_CONFIG_DIR` from `shared.js`, but tests must be able to pass a temp `configDir`.

- [ ] **Step 4: Export the new module from `index.js`**

Add exports in `packages/web/server/lib/opencode/index.js`:

```js
export {
  listPackagedAgents,
  syncPackagedAgentsToUserConfig,
} from './packaged-agents.js';
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
bun run --cwd packages/web test -- opencode-agents.test.js
```

Expected: PASS.

## Task 3: Sync Packaged Agents Before Managed OpenCode Starts

**Files:**
- Modify `packages/web/server/lib/opencode/lifecycle.js`
- Modify `packages/vscode/src/opencode.ts`
- Modify `packages/vscode/src/opencodeConfig.ts`

- [ ] **Step 1: Add a startup sync call in the web/Electron server lifecycle**

In `packages/web/server/lib/opencode/lifecycle.js`, import `syncPackagedAgentsToUserConfig` and call it before the managed OpenCode process starts or restarts. Place it at the beginning of the managed startup path, before OpenCode readiness checks and before `/agent` is queried.

```js
import { syncPackagedAgentsToUserConfig } from './packaged-agents.js';

// Inside the managed startup branch before spawning OpenCode:
syncPackagedAgentsToUserConfig();
```

Do not run this for external `OPENCODE_HOST` with `OPENCODE_SKIP_START=true` if there is no local managed OpenCode process. External servers own their own config.

- [ ] **Step 2: Add VS Code parity**

`packages/vscode/src/opencodeConfig.ts` duplicates OpenCode config helpers. Add the same packaged-agent sync helper there, resolving package assets relative to the extension bundle. Then call it from `packages/vscode/src/opencode.ts` before `startInternal()` spawns managed OpenCode.

Use the same non-overwrite rule: write missing files and update files only when their current hash matches the previous package-managed hash.

- [ ] **Step 3: Verify runtime startup sees agents**

Run:

```bash
bun run --cwd packages/web test -- opencode-agents.test.js
bun run vscode:type-check
```

Expected: web tests pass and VS Code type-check passes.

## Task 4: Make Settings/Agents List Global Agents For Every Project

**Files:**
- Modify `packages/web/server/lib/opencode/agents.js`
- Modify `packages/web/server/lib/opencode/config-entity-routes.js`
- Modify `packages/vscode/src/opencodeConfig.ts`
- Test: `packages/web/server/opencode-agents.test.js`

- [ ] **Step 1: Write failing tests for merged project/user listing**

Append a test:

```js
it('lists user-level agents for a project without project-local agent files', async () => {
  projectDirectory = await makeTempProject();
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-user-agents-'));
  await fs.mkdir(path.join(configDir, 'agents'), { recursive: true });
  await fs.writeFile(path.join(configDir, 'agents', 'builder.md'), [
    '---',
    'mode: primary',
    'description: Global builder',
    '---',
    '',
    'Global builder prompt',
    '',
  ].join('\n'));

  const agents = listConfigurableAgents(projectDirectory, { configDir });
  expect(agents).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'builder', scope: 'user', mode: 'primary' }),
  ]));
});
```

- [ ] **Step 2: Implement user/global listing and project precedence**

In `packages/web/server/lib/opencode/agents.js`, add `listUserAgents()` and `listConfigurableAgents()`:

```js
function listUserAgents(options = {}) {
  const userAgentRoot = options.configDir ? path.join(options.configDir, 'agents') : AGENT_DIR;
  return listAgentsFromRoots([userAgentRoot], AGENT_SCOPE.USER);
}

function listConfigurableAgents(workingDirectory, options = {}) {
  const byName = new Map();
  for (const agent of listUserAgents(options)) byName.set(agent.name, agent);
  for (const agent of listProjectAgents(workingDirectory)) byName.set(agent.name, agent);
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}
```

Refactor the existing `listProjectAgents()` directory walk into a shared `listAgentsFromRoots(roots, scope)` helper so project and user listing parse model fields, prompt body, group, and built-in flags consistently.

- [ ] **Step 3: Update the HTTP route to use the merged list**

In `packages/web/server/lib/opencode/config-entity-routes.js`, replace:

```js
const agents = listProjectAgents(directory);
const fallbackAgents = agents.length === 0 && directory !== process.cwd()
  ? listProjectAgents(process.cwd())
  : agents;
res.json({ agents: fallbackAgents });
```

with:

```js
res.json({ agents: listConfigurableAgents(directory) });
```

Thread `listConfigurableAgents` through the dependency injection from `packages/web/server/index.js` if needed.

- [ ] **Step 4: Update VS Code parity**

Add the same `listUserAgents()` / `listConfigurableAgents()` behavior to `packages/vscode/src/opencodeConfig.ts` and ensure the bridge route that handles `api:config/agents` uses the merged list when listing all agents. Metadata routes should continue to use `getAgentSources()` so project overrides win over user/global files.

- [ ] **Step 5: Run focused validation**

Run:

```bash
bun run --cwd packages/web test -- opencode-agents.test.js
bun run validate:affected
```

Expected: tests pass; affected validation passes.

## Task 5: Keep Editing And Reset Semantics Correct

**Files:**
- Modify `packages/web/server/lib/opencode/agents.js`
- Modify `packages/ui/src/stores/useAgentsStore.ts`
- Test: `packages/web/server/opencode-agents.test.js`

- [ ] **Step 1: Confirm edits target the correct scope**

Existing `updateAgent()` already prioritizes project `.md`, then user `.md`, then JSON/built-in override. Because packaged agents are synced to user `.md`, editing a packaged default in Settings will update the user-level copy and will not mutate package assets.

Add a test that edits a synced user-level agent while a project has no local agent:

```js
it('updates a global user agent instead of creating a project override', async () => {
  projectDirectory = await makeTempProject();
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-user-agent-edit-'));
  await fs.mkdir(path.join(configDir, 'agents'), { recursive: true });
  const userAgentPath = path.join(configDir, 'agents', 'builder.md');
  await fs.writeFile(userAgentPath, '---\nmode: primary\n---\n\nOld prompt\n', 'utf8');

  updateAgent('builder', { prompt: 'New prompt' }, projectDirectory, { configDir });

  await expect(fs.readFile(userAgentPath, 'utf8')).resolves.toContain('New prompt');
  await expect(fs.stat(path.join(projectDirectory, '.opencode', 'agents', 'builder.md'))).rejects.toThrow();
});
```

If `agents.js` does not currently accept an options bag, add it narrowly to testable helper functions without changing HTTP callers.

- [ ] **Step 2: Make created agents default to user scope when created from Settings/Agents**

In `packages/ui/src/stores/useAgentsStore.ts`, change create defaults so new Settings/Agents entries are global unless the user explicitly chooses project scope:

```ts
if (config.scope) {
  agentConfig.scope = config.scope;
} else {
  agentConfig.scope = 'user';
}
```

This matches the requirement that Settings/Agents entries are available for all projects. The UI scope selector can still create a project-specific override when needed.

- [ ] **Step 3: Keep delete as disable/override-safe**

For user-level synced defaults, `deleteAgent()` can delete the user copy. On the next app startup, the sync state must prevent silent recreation only if the user intentionally deleted it. Track deletions in `.openchamber/packaged-agents.json`:

```json
{
  "version": 1,
  "agents": {
    "builder": {
      "hash": "...",
      "disabled": true
    }
  }
}
```

When a package-managed file is missing but state says it existed before, do not recreate it unless the packaged hash changed and the user has not marked it disabled.

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun run --cwd packages/web test -- opencode-agents.test.js
bun run validate:affected
```

Expected: all tests and validation pass.

## Task 6: Packaging And Manual Verification

**Files:**
- Modify `CODEMAP.md` only if new ownership paths need future routing documentation.

- [ ] **Step 1: Run baseline validation**

Run:

```bash
bun run validate:affected
```

Expected: PASS.

- [ ] **Step 2: Verify package assets are included**

Run:

```bash
bun pm pack --cwd packages/web
```

Expected: package output includes `server/default-config/agents/*.md`.

- [ ] **Step 3: Verify Electron app packaging includes the web package assets**

Run:

```bash
bun run electron:build
```

Expected: build succeeds. Inspect the packaged app contents and confirm `@openchamber/web/server/default-config/agents/*.md` exists inside the application bundle.

- [ ] **Step 4: Manual runtime check**

Start the app, switch to a project that is not the DevRyan repo, and verify:

1. Settings -> Agents shows `builder`, `orchestrator`, `plan`, `explorer`, `fixer`, `designer`, `oracle`, `librarian`, and `council`.
2. The chat agent picker shows the same selectable primary/subagent agents.
3. Creating a new agent in Settings with no explicit project scope makes it available after switching to another project.
4. Editing a default agent persists across restart and is not overwritten by packaged defaults.
5. Deleting or disabling a default agent does not silently recreate it on the next restart unless the user resets it.

## Self-Review

- Spec coverage: The plan makes the DevRyan agents package-owned, syncs them before managed OpenCode starts, exposes them to every project via OpenCode's global user config, and updates Settings/Agents to list global agents rather than only project agents.
- Placeholder scan: No task relies on unspecified "add tests" or "handle edge cases"; each task names files, behavior, commands, and expected outcomes.
- Type/signature consistency: New server helpers are `listPackagedAgents`, `syncPackagedAgentsToUserConfig`, `listUserAgents`, and `listConfigurableAgents`; these names are used consistently across tasks.
