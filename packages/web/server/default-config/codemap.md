# packages/web/server/default-config/

## Responsibility
Default server-scaffolded OpenCode configuration and bundled agent role templates shipped for fresh runtime setup.

## Design
- `opencode.json` defines baseline agent/plugin constraints for embedded runtime startup.
- `agents/*.md` provides canned role instructions (builder/fixer/orchestrator/etc.) copied or referenced during bootstrap flows.
- `plugins/*.js` / `plugins/*.mjs` provides bundled OpenCode plugins copied into the active managed runtime config overlay. `devryan-oh-my-opencode-slim.mjs` is the DevRyan-preserving wrapper for `oh-my-opencode-slim` and intentionally strips Slim agent prompt/system-transform ownership while preserving Slim runtime hooks.
- `.gitignore` keeps generated/localized artifacts out of source control.

## Flow
1. Server bootstrap checks for user/project config presence.
2. Missing config is initialized from this directory defaults.
3. Agent templates become available to orchestration tooling as default personas.
4. Bundled plugins become available as runtime tools for managed OpenCode launches.

## Integration
- Used by web server initialization paths that provision OpenCode-compatible defaults.
- Influences out-of-box behavior of agent execution, plugin loading, and prompt-role availability.
