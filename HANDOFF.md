# Plan card foundation — handoff

Picked up from `/Users/zoubair/.claude/plans/when-a-plan-is-ticklish-clover.md`. All work is **uncommitted** in the working tree. Last successful `bun run --cwd packages/ui type-check` ran clean before the final QuestionCard refactor; type-check has not been re-run after the QuestionCard rewrite.

## Status: ~85% complete, not yet validated

Phases A–D are done. Phase E is partially done (QuestionCard rewrite + ChatContainer merge landed; magic-prompt question instruction NOT yet added). Final validation (`type-check:ui`, `validate:affected`) NOT yet run after the QuestionCard rewrite.

## Done (changes in working tree)

### Phase A — legacy plan-card deletion
- `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx` — rewritten. Always renders `MarkdownRenderer`. `isPlanModeSource`/`streamPhase` kept on the prop interface as dead-end with `TODO(plan-card-rebuild)`.
- `packages/ui/src/components/chat/message/MessageBody.tsx` — `forcePlanContainer` prop removed end-to-end (interface, destructuring, all 3 passthroughs, memo deps).
- `packages/ui/src/components/chat/ChatMessage.tsx` — `forcePlanContainer` derivation + prop removed. `shouldUsePreviousUserMessageAsPlanSource` replaced with inline call to `isPlanModeUserMessage`.
- Deleted: `packages/ui/src/lib/messages/planDetection.ts` + `planDetection.test.ts`, `packages/ui/src/hooks/usePlanDetection.ts`, `packages/ui/src/components/chat/message/parts/AssistantTextPart.plan-card.test.tsx`.
- `packages/ui/src/lib/messages/actionablePlan.ts` — slimmed to: `getPlanBlockId`, `getPlanImplementationKey`, `isPlanModeInstructionPart`, `isPlanModeUserMessage`. Removed: `shouldUsePreviousUserMessageAsPlanSource`, `findOriginatingUserMessage`.
- `packages/ui/src/lib/messages/actionablePlan.test.ts` — rewritten against the new export surface.
- `packages/ui/src/index.css` — removed `@keyframes oc-plan-skeleton-pulse`, `@keyframes oc-plan-card-enter`, `.oc-plan-skeleton-bar`, `.animate-plan-card-enter`, and their `prefers-reduced-motion` rule.

### Phase B — fenced plan.md instruction removed
- `packages/ui/src/sync/session-ui-store.ts` (line ~185) — synthetic plan-mode prompt no longer asks for ```plan.md fences.
- `packages/ui/src/lib/magicPrompts.ts` (`plan.todo.instructions`, line ~414) — same.
- `packages/ui/src/lib/magicPrompts.fence-regression.test.ts` — NEW. Guards against re-introducing the fence instruction.

### Phase C — deterministic plan-proposed trigger
- `packages/ui/src/sync/sync-context.tsx` — `detectAndMarkPlanProposed(sessionID, store)` helper added at module scope (near `openSessionFromToast`); fired on every `session.idle` event. Gates: no pending questions, originating user message is plan-mode (via `useSessionUIStore.isUserMessagePlanMode` + metadata fallback), implementation key not already in `implementedPlanRequests`. Best-effort, swallows errors. Uses dynamic imports for `session-ui-store` + `actionablePlan` to avoid circular deps.
- `packages/ui/src/components/chat/ChatContainer.tsx` — `usePlanDetection` import + call removed. Comment added explaining the move.
- `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` — `detectReadyPlanSourceMessageId` import + its `useDirectorySync` block + the fallback `markPlanProposed` effect removed. Component now just reads the indicator.
- `packages/ui/src/sync/session-ui-store.ts` — `TODO(plan-card-rebuild)` comments added above `markPlanImplementing` and `markPlanCompleted` (transitions not yet wired; the rebuild owns them).

### Phase D — useSessionLifecycleStatus
- `packages/ui/src/lib/sessionLifecycleStatus.ts` — NEW. Pure `deriveSessionLifecycleStatus(inputs)` helper. Composition order: error → awaiting-question → plan-executing → plan-proposed (+ assistant idle) → streaming → idle.
- `packages/ui/src/lib/sessionLifecycleStatus.test.ts` — NEW. 8 tests, all passing.
- `packages/ui/src/hooks/useAssistantStatus.ts` — refactored to accept optional `sessionId` arg; falls back to current session. `useCurrentSessionActivity` swapped for `useSessionActivity(effectiveSessionId)`. All internal reads now use `effectiveSessionId`.
- `packages/ui/src/hooks/useSessionLifecycleStatus.ts` — NEW. Composes the four signals. `sdkSessionStatusError` is hard-coded to `null` for now — the SDK `SessionStatus` enum is `idle|busy|retry` (no `error`). TODO comment in place to wire a real session-error store field later.
- `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` — subscribes to `useSessionLifecycleStatus`. Active-status spinner now tints with primary tokens when `kind === 'plan-executing'`. Uses new i18n key `sessions.sidebar.session.status.planExecuting`. (This branch is currently inert because `markPlanImplementing` is the deferred trigger — it'll light up when the plan-card rebuild lands.)
- `packages/ui/src/lib/i18n/messages/en.ts` — added `sessions.sidebar.session.status.planExecuting: 'Implementing plan'`.

### Phase E — Q&A (partial)
- `packages/ui/src/components/chat/QuestionCard.tsx` — **REWRITTEN**. New `requests?: QuestionRequest[]` prop (back-compat `question?` still accepted). Internally flattens all questions across all requests. Stacked layout when total ≤ 3, tabs otherwise. On submit, groups answers by source request id and issues one `respondToQuestion` per request via `Promise.allSettled`; partial failures show per-request error chip without blocking successful submissions. Dismiss handler does the same for `rejectQuestion`. **NOT YET TYPE-CHECKED.**
- `packages/ui/src/components/chat/ChatContainer.tsx` (line ~231) — merged-card render: passes `requests={sessionQuestions}` to one `QuestionCard` instead of mapping per-request.

## Not done

1. **Phase E — magic-prompt question-tool instruction.** Need to append "For clarifying questions, always use the structured question tool. Send 2–3 related questions in a single call by populating the `questions[]` array. Never ask clarifying questions as free-form chat text." to `plan.todo.instructions` (and possibly `github.issue.review.instructions`) in `packages/ui/src/lib/magicPrompts.ts`. Comment that it's best-effort.

2. **Type-check after QuestionCard rewrite.** `bun run --cwd packages/ui type-check`. Expect possible issues:
   - `respondToQuestion` / `rejectQuestion` signatures — verify they return promises and accept `(sessionID, questionID, answers)` / `(sessionID, questionID)` respectively.
   - `QuestionRequest.questions[number]` field access — confirm `header`, `question`, `options`, `multiple` exist on that type.

3. **`bun run validate:affected`** — primary validation. Not run yet.

4. **Grouped-question reply unit test** — the plan calls for a test asserting 2 separate `QuestionRequest`s rendered in one card produce 2 separate `question.reply` calls. Not yet written. Mock `sessionActions.respondToQuestion` and assert call args.

5. **Targeted plan-detection event-pipeline tests** — the plan listed 7 cases (recorded flag triggers; metadata fallback; non-plan no-op; implemented suppression; latest visible wins; not while streaming; not while questions pending). Not yet written. They'd cover `detectAndMarkPlanProposed` in `sync-context.tsx`. Hard to unit-test directly because it's an inline function in a large module — consider extracting it to a separate file (`packages/ui/src/sync/plan-proposed-detection.ts`) before testing.

## Resume sequence

```bash
# 1. Type-check first — catches QuestionCard fallout
bun run --cwd packages/ui type-check

# 2. Run the new unit tests
cd packages/ui && bun test src/lib/sessionLifecycleStatus.test.ts \
  src/lib/magicPrompts.fence-regression.test.ts \
  src/lib/messages/actionablePlan.test.ts

# 3. Append the question-tool instruction to magicPrompts.ts (Phase E item 1)

# 4. Extract detectAndMarkPlanProposed to its own file and add the 7 unit tests

# 5. Add the grouped-question reply test

# 6. Final validation
bun run validate:affected
```

## Risks / caveats

- **QuestionCard rewrite is untested.** I haven't even typed-checked it. Likely needs a few signature adjustments. Read the function carefully or write a quick test before trusting it.
- **`markPlanImplementing` / `markPlanCompleted` are unwired** — the new plan card (next session) must call them from its "Implement Plan" handler. The sidebar's `plan-executing` tint will be dark until that happens.
- **Per-session error state is missing** — the lifecycle hook's `error` branch is type-correct but always `null`. Wiring a real per-session error signal is out of scope for this scaffolding.
- **Plan-mode prompt strings changed** — assistants currently in flight may still produce ```plan.md fences from the old instruction. Will resolve on the next user turn.
- **Working tree is clean of git changes, but the diff is sizeable** — ~20 files modified, 5 deleted, 3 new. Consider splitting into commits per phase before pushing: A+C deletions, B prompt fix, D selector, E Q&A.

## Files touched (for git scope)

**Modified:**
- `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx`
- `packages/ui/src/components/chat/message/MessageBody.tsx`
- `packages/ui/src/components/chat/ChatMessage.tsx`
- `packages/ui/src/components/chat/ChatContainer.tsx`
- `packages/ui/src/components/chat/QuestionCard.tsx`
- `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`
- `packages/ui/src/sync/sync-context.tsx`
- `packages/ui/src/sync/session-ui-store.ts`
- `packages/ui/src/lib/magicPrompts.ts`
- `packages/ui/src/lib/messages/actionablePlan.ts`
- `packages/ui/src/lib/messages/actionablePlan.test.ts`
- `packages/ui/src/lib/i18n/messages/en.ts`
- `packages/ui/src/hooks/useAssistantStatus.ts`
- `packages/ui/src/index.css`

**New:**
- `packages/ui/src/lib/sessionLifecycleStatus.ts`
- `packages/ui/src/lib/sessionLifecycleStatus.test.ts`
- `packages/ui/src/lib/magicPrompts.fence-regression.test.ts`
- `packages/ui/src/hooks/useSessionLifecycleStatus.ts`

**Deleted:**
- `packages/ui/src/lib/messages/planDetection.ts`
- `packages/ui/src/lib/messages/planDetection.test.ts`
- `packages/ui/src/hooks/usePlanDetection.ts`
- `packages/ui/src/components/chat/message/parts/AssistantTextPart.plan-card.test.tsx`
