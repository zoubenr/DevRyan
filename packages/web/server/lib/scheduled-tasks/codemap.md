# packages/web/server/lib/scheduled-tasks/

## Responsibility
Scheduled automation subsystem for project tasks: schedule computation, runtime orchestration/queueing, manual run triggers, and task status/event APIs.

## Design
- `runtime.js` is core engine: next-run computation (`daily/weekly/once/cron`), concurrency limits, jitter, run lifecycle/state.
- `routes.js` provides CRUD/run/status endpoints and an SSE channel for OpenChamber events.
- Runtime uses deterministic task keys (`projectID:taskID`) and bounded execution windows.

## Flow
1. Route layer validates IDs/payloads and persists task config via project config runtime.
2. Runtime `syncProject()` recalculates scheduled timers after create/update/delete.
3. Scheduler fires due tasks, starts OpenCode sessions, and records run state/errors.
4. Status endpoints/SSE surface enabled/running counts and lifecycle events to clients.

## Integration
- Depends on settings/project config runtimes and OpenCode SDK client creation for task execution.
- Consumed by UI scheduled-task management screens and background server startup lifecycle.
