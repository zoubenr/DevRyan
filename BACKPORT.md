# Upstream backports

## 2026-05-13 — from `openchamber/openchamber` `main`

| SHA | Title |
| --- | --- |
| `154af1b2` | `fix(status): classify multiedit as editing (#1209)` |
| `731555dd` | `fix(tts): clamp generated summaries (#1187)` |
| `10db8ace` | `fix(quota): ignore invalid reset timestamps (#1182)` |
| `d7d97452` | `fix(terminal): preserve UTF-8 replay chunks (#1181)` |
| `5802cd6c` | `fix(event-stream): clean up reconnect delay listeners (#1180)` |
| `fecb4c24` | `fix(event-stream): isolate subscriber failures (#1235)` |
| `f1e484d5` | `fix(opencode): clear readiness probe timers (#1226)` |
| `4c07b5c9` | `fix(opencode): clear server close timeout (#1224)` |
| `17844ba0` | `fix(terminal): remove upgrade listener on shutdown (#1233)` |
| `3a9257b7` | `fix(ui): recover from corrupt chunk reload markers (#1230)` |

## Local divergences to preserve

- `packages/web/server/lib/quota/utils/formatters.js`: this fork adds an `errorCode` field to `buildResult`. Future upstream merges must preserve that field.
- `packages/web/server/lib/terminal/output-replay-buffer.js`: the UTF-8-safe trim path intentionally favors correctness over constant-time byte slicing when an oversized terminal replay chunk is trimmed.
