# Test and validation discovery (2026-05-19)

Baseline notes for the low-risk optimization initiative. Re-run measurements after runner changes.

## Test entrypoints

| Package | Command | Runner |
|---------|---------|--------|
| UI | `bun run --cwd packages/ui test` | `scripts/test-ui.mjs` — one Bun process per file (batching added for non-`mock.module` files) |
| Web | `bun run --cwd packages/web test` | Vitest single process |
| VS Code | `bun run --cwd packages/vscode test` | `scripts/test-vscode.mjs` — Vitest + Bun for `quotaProviders` |
| Scripts | `bun run test:scripts` | Node test coverage for validation/test runner helpers |
| Full | `bun run test:full` | Scripts + UI + Web + VS Code |

## UI test inventory

- 137 test files under `packages/ui/src` (see `node scripts/measure-ui-tests.mjs` for current counts).
- **Isolated per process** (auto-detected in `scripts/test-ui.mjs`):
  - `mock.module` users, e.g. `session-ui-store.send.test.ts`, `session-actions.test.ts`
  - Tests that mutate global `window` or `sessionStorage` via direct assignment, typed global assignment, delete, or `Object.defineProperty`
- Remaining files run in one batched Bun invocation.

## Validation planner (`scripts/validate.mjs`)

| Mode | Tests |
|------|-------|
| `validate:quick` | Lint changed TS; type-check affected packages; **skips** non-test UI source tests |
| `validate:affected` | Expands UI→web/vscode type-check; runs ui/web tests for sync/store/lib paths |
| `validate:full` | Lint + type-check + `test:full` workspace-wide |

**Removed stale triggers:** `vitest.workspace.ts` and `vitest.ui.config.ts` were listed in `fullValidationFiles` but do not exist in the repo.

## CI gap (addressed in this initiative)

- `.github/workflows/oc-review.yml` previously ran `build`, `type-check`, and `lint` only.
- `test:full` (ui + web + vscode) is now a PR check step.

## Agent workflow guidance

- UI copy / isolated component: `bun run validate:quick`
- Sync, stores, server routes: `bun run validate:affected` or `test:full` when touching contracts
- Root `package.json` / lockfile / validate script: `bun run validate:full`

## Measurement

```bash
# Inventory and per-file timings
node scripts/measure-ui-tests.mjs

# Time first N files (optional)
MEASURE_UI_TESTS_LIMIT=20 node scripts/measure-ui-tests.mjs
```

## Deferred (intentional)

- Tauri package / `__TAURI__` shim until Electron cutover
- Legacy skill paths, Cloudflare tunnel migration file, session-worktree `legacy` semantics
- Web vs VS Code duplicate backends (`opencodeConfig`, quota, skills, git)
- Merging `event-pipeline` / `event-reducer` dual `.ts`/`.js` suites
