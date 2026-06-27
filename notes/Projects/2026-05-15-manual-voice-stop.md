# Manual Voice Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep bottom-right voice input active across pauses in speech, and stop it only when the user clicks the stop button or when an explicit lifecycle cleanup occurs.

**Architecture:** Treat silence as an utterance boundary, not a voice-session boundary. The shared hook in `packages/ui/src/hooks/useBrowserVoice.ts` remains the state-machine owner; provider services only emit transcript/error/level events and expose explicit `stopListening()` cleanup.

**Tech Stack:** React, TypeScript, Bun test, Web Speech API, MediaRecorder STT services, Electron macOS speech IPC.

---

## File Structure

- Modify: `packages/ui/src/hooks/useBrowserVoice.ts`
  - Add a small voice lifecycle helper/state reducer so recoverable silence, provider `end`, and final transcript settling keep `status === "listening"` while `isActiveRef.current === true`.
  - Keep explicit stop paths unchanged: user stop button, session change, unmount, provider change/device restart failure.
- Modify: `packages/ui/src/lib/voice/browserVoiceService.ts`
  - Make recognition restart observable and deterministic when Web Speech ends because the user paused.
  - Avoid invoking the fatal error path for `no-speech`/normal `end` while restart is intended.
- Modify: `packages/ui/src/lib/voice/audioStreamService.ts`
  - Ensure `_finaliseUtterance()` restarts recording after silence without clearing callbacks or `isActive`.
  - Add exported test seams only if needed by tests; do not change public UI behavior.
- Modify: `packages/ui/src/lib/voice/wasmSttService.ts`
  - Mirror the server STT behavior: `finalizeUtterance(true)` must keep the service active and ready for the next utterance.
- Modify: `packages/ui/src/lib/voice/nativeMacosSpeechService.ts`
  - Ignore helper `stopped` events when they come from internal utterance-cycle restarts, or add an explicit reason field if the helper needs to distinguish restart vs user stop.
- Modify: `packages/electron/native/macos-speech/MacosSpeechHelper.swift`
  - Only if native testing proves the helper emits `stopped` after silence: add an event reason such as `"reason": "user_stop"` for real stops and do not emit `stopped` during `restartRecognitionCycle()`.
- Test: `packages/ui/src/hooks/useBrowserVoice.test.ts`
  - Add state-machine/helper tests for silence recovery and manual stop.
- Test: `packages/ui/src/lib/voice/nativeMacosSpeechService.test.ts`
  - Add event handling coverage for native stop/restart semantics.
- Create if needed: `packages/ui/src/lib/voice/browserVoiceService.test.ts`
  - Unit-test Web Speech restart behavior with a mocked `SpeechRecognition`.

## Root Cause Check

- Current shared hook already classifies `no-speech` as recoverable in `isRecoverableVoiceSilenceError()`.
- The bug still appears because at least one provider path can make the session look inactive after silence: recognizer `onend`, STT recorder finalization, or native helper `stopped`.
- The fix should not lengthen silence thresholds as a workaround. Silence should still finalize one transcript promptly; it just must not toggle the voice button back to idle.

## Tasks

### Task 1: Add Explicit Voice Lifecycle Tests

**Files:**
- Modify: `packages/ui/src/hooks/useBrowserVoice.ts`
- Modify: `packages/ui/src/hooks/useBrowserVoice.test.ts`

- [ ] **Step 1: Extract pure lifecycle helpers**

Add exported helpers near the existing draft helpers:

```ts
export type VoiceLifecycleEvent =
  | { type: 'start' }
  | { type: 'manual-stop' }
  | { type: 'recoverable-silence' }
  | { type: 'fatal-error'; error: string }
  | { type: 'provider-ended'; explicitStop: boolean };

export const resolveVoiceLifecycleStatus = (
  current: BrowserVoiceStatus,
  event: VoiceLifecycleEvent,
): BrowserVoiceStatus => {
  if (event.type === 'start') return 'listening';
  if (event.type === 'manual-stop') return 'idle';
  if (event.type === 'recoverable-silence') return 'listening';
  if (event.type === 'provider-ended') return event.explicitStop ? 'idle' : current === 'error' ? 'error' : 'listening';
  return 'error';
};
```

- [ ] **Step 2: Add failing tests**

Append to `packages/ui/src/hooks/useBrowserVoice.test.ts`:

```ts
import { resolveVoiceLifecycleStatus } from './useBrowserVoice';

describe('voice lifecycle status', () => {
  test('keeps listening after recoverable silence', () => {
    expect(resolveVoiceLifecycleStatus('listening', { type: 'recoverable-silence' })).toBe('listening');
  });

  test('keeps listening after a non-explicit provider end', () => {
    expect(resolveVoiceLifecycleStatus('listening', { type: 'provider-ended', explicitStop: false })).toBe('listening');
  });

  test('returns idle only for manual stop', () => {
    expect(resolveVoiceLifecycleStatus('listening', { type: 'manual-stop' })).toBe('idle');
  });

  test('returns error for fatal recognition errors', () => {
    expect(resolveVoiceLifecycleStatus('listening', { type: 'fatal-error', error: 'permission denied' })).toBe('error');
  });
});
```

- [ ] **Step 3: Run the focused tests**

Run: `bun run --cwd packages/ui test -- useBrowserVoice.test.ts`

Expected: new tests fail until the helper is exported and wired correctly.

### Task 2: Wire Silence Recovery Through `useBrowserVoice`

**Files:**
- Modify: `packages/ui/src/hooks/useBrowserVoice.ts`

- [ ] **Step 1: Use the helper in recoverable error handling**

Replace direct silence status assignment inside `handleSpeechError`:

```ts
if (isRecoverableVoiceSilenceError(errorMsg)) {
  console.log('[useBrowserVoice] Ignoring recoverable silence error:', errorMsg);
  setError(null);
  setStatus((current) => resolveVoiceLifecycleStatus(current, { type: 'recoverable-silence' }));
  return;
}
```

- [ ] **Step 2: Keep fatal errors as explicit terminal states**

Keep the fatal branch stopping services, but set status through the helper:

```ts
setError(errorMsg);
setStatus(resolveVoiceLifecycleStatus('listening', { type: 'fatal-error', error: errorMsg }));
```

- [ ] **Step 3: Keep manual stop as the only normal idle transition**

In `stopVoice`, replace `setStatus('idle')` with:

```ts
setStatus(resolveVoiceLifecycleStatus(status, { type: 'manual-stop' }));
```

If the callback dependency on `status` causes churn, use a functional setter:

```ts
setStatus((current) => resolveVoiceLifecycleStatus(current, { type: 'manual-stop' }));
```

- [ ] **Step 4: Run focused tests**

Run: `bun run --cwd packages/ui test -- useBrowserVoice.test.ts`

Expected: lifecycle and existing draft-helper tests pass.

### Task 3: Make Browser Speech Recognition Restart Intentional

**Files:**
- Modify: `packages/ui/src/lib/voice/browserVoiceService.ts`
- Create if needed: `packages/ui/src/lib/voice/browserVoiceService.test.ts`

- [ ] **Step 1: Track explicit stops**

Add a private flag:

```ts
private explicitStopRequested = false;
```

Set it in `stopListening()` and clear it in `startListeningSync()`:

```ts
this.explicitStopRequested = false;
```

```ts
this.explicitStopRequested = true;
this.restartOnEnd = false;
```

- [ ] **Step 2: Restart after non-explicit `onend`**

Change `recognition.onend` so only explicit stop prevents restart:

```ts
this.recognition.onend = () => {
  this.isListening = false;
  if (!this.restartOnEnd || this.explicitStopRequested || this.isSpeaking) return;

  window.setTimeout(() => {
    if (!this.restartOnEnd || this.explicitStopRequested || this.isSpeaking || !this.recognition) return;
    try {
      this.recognition.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart speech recognition';
      this.onErrorCallback?.(message);
    }
  }, 150);
};
```

- [ ] **Step 3: Keep `no-speech` recoverable**

In `recognition.onerror`, do not set `restartOnEnd = false` for `no-speech`. Keep it terminal only for:

```ts
event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'network'
```

- [ ] **Step 4: Add a mocked-recognition test**

Test that `onend` calls `start()` again after a pause, and that `stopListening()` prevents restart. If mocking Web Speech in Bun is too brittle, keep this behavior covered manually and document the limitation in the final verification.

### Task 4: Verify STT Providers Treat Silence As Utterance Boundary

**Files:**
- Modify: `packages/ui/src/lib/voice/audioStreamService.ts`
- Modify: `packages/ui/src/lib/voice/wasmSttService.ts`

- [ ] **Step 1: Audit server STT finalization**

Confirm `_finaliseUtterance()` stops only the current recorder, uploads the blob, and restarts recorder while `this.isActive` remains `true`.

- [ ] **Step 2: Audit WASM STT finalization**

Confirm `finalizeUtterance(true)` stops only the current recorder and restarts recorder while `this.isActive` remains `true`.

- [ ] **Step 3: Fix only if audit finds a terminal transition**

If either provider clears callbacks, tracks, stream, or `isActive` during silence finalization, move that cleanup back into `stopListening()` only.

- [ ] **Step 4: Run provider tests or type-check**

Run: `bun run --cwd packages/ui test -- useBrowserVoice.test.ts`

Expected: tests pass. If provider-specific tests are added, run them in the same command.

### Task 5: Fix Native macOS Stop Semantics If Reproduced

**Files:**
- Modify: `packages/ui/src/lib/voice/nativeMacosSpeechService.ts`
- Modify: `packages/ui/src/lib/voice/nativeMacosSpeechService.test.ts`
- Modify only if needed: `packages/electron/native/macos-speech/MacosSpeechHelper.swift`

- [ ] **Step 1: Add native event tests**

Extend `nativeMacosSpeechService.test.ts` with:

```ts
test('does not treat internal native restart as user stop', async () => {
  const { handlers } = installMockWindow();
  await nativeMacosSpeechService.startListening('en-US', () => {}, () => {});

  handlers.get('openchamber:macos-speech')?.({
    payload: { type: 'stopped', provider: 'macos', reason: 'restart' },
  });

  expect(nativeMacosSpeechService.getIsListening()).toBe(true);
});
```

- [ ] **Step 2: Support stop reasons in the TypeScript event type**

Change the stopped event type to:

```ts
| { type: 'stopped'; provider: 'macos'; reason?: 'user_stop' | 'restart' | 'process_exit' }
```

- [ ] **Step 3: Ignore restart stops**

In the `payload.type === 'stopped'` branch:

```ts
if (payload.reason === 'restart') {
  return;
}
this.isListening = false;
```

- [ ] **Step 4: Update Swift only if it currently emits stopped during silence**

If manual reproduction or logs show `MacosSpeechHelper.swift` emits `stopped` from `restartRecognitionCycle()`, change internal restart paths to emit no stopped event or emit:

```swift
emit(["type": "stopped", "reason": "restart"])
```

Real user stops should remain:

```swift
emit(["type": "stopped", "reason": "user_stop"])
```

- [ ] **Step 5: Run native bridge tests**

Run: `bun run --cwd packages/ui test -- nativeMacosSpeechService.test.ts`

Expected: existing native bridge tests and the new restart-stop test pass.

### Task 6: Manual Runtime Verification

**Files:**
- No code changes unless runtime testing finds a gap.

- [ ] **Step 1: Start the app**

Run: `bun run electron:dev`

- [ ] **Step 2: Test bottom-right voice behavior**

Manual sequence:

1. Open a chat input.
2. Click the bottom-right mic button.
3. Say “first sentence”.
4. Stop speaking for longer than the configured silence hold.
5. Confirm the button still shows the stop icon and microphone level/listening status remains active.
6. Say “second sentence”.
7. Confirm both utterances are appended to the same draft.
8. Click the stop button.
9. Confirm the button returns to idle and no further transcript is appended.

- [ ] **Step 3: Check session-change cleanup**

While voice is active, switch sessions.

Expected: voice stops, because session change is an explicit lifecycle cleanup and should not carry the microphone between sessions.

### Task 7: Final Validation

**Files:**
- No code changes.

- [ ] **Step 1: Run quick validation**

Run: `bun run validate:quick`

Expected: validation passes.

- [ ] **Step 2: Escalate validation if native helper changed**

If `packages/electron/native/macos-speech/MacosSpeechHelper.swift` changed, also run:

```bash
bun run type-check:electron
bun run electron:build
```

Expected: Electron checks/build pass.

## Notes

- Do not change `packages/desktop/`; Tauri is legacy and the bottom-right shared UI should stay shell-agnostic.
- Do not widen stop behavior based on historical state. Use only live provider events and explicit user/lifecycle actions.
- Do not add a new setting for this. The requested behavior should be the default: silence finalizes an utterance, not the whole voice session.
- Do not run git commit/stage commands unless explicitly asked.
