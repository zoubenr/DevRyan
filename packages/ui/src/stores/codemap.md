# packages/ui/src/stores/

## Responsibility
Zustand store layer for persisted and session-local client state: UI preferences, config/providers/agents, directory/worktree context, queueing, git metadata, skills/MCP/projects configuration, and supporting store utilities.

## Design
- **Store-per-domain**: each feature has a focused store (`useUIStore`, `useConfigStore`, `useGitStore`, `useSkillsStore`, etc.) to limit cross-feature coupling.
- **Middleware stack**: many stores use `persist` + `devtools`; persistence uses `getSafeStorage()` for environment-safe access.
- **Utility-first reducers**: `utils/*` centralizes reusable transforms/projectors (stream debug, message/context utilities, permission helpers).
- **Inter-store orchestration**: stores often call other stores via `.getState()` in actions to avoid broad subscriptions.

## Flow
1. Components/hooks subscribe via narrow selectors.
2. User actions invoke store actions; actions may call backend helpers in `lib/*`.
3. Persisted stores serialize selected state slices to storage/settings.
4. Sync system and feature hooks consume store state for rendering and command execution.

## Integration
- Works alongside `src/sync/*`: sync owns high-frequency live message/session data; stores own preferences/config/workflow state.
- Consumed throughout `components/*` and `hooks/*`.
- Depends on `lib/*` for transport and persistence side effects (e.g., config reload, desktop settings writes, git/project operations).
