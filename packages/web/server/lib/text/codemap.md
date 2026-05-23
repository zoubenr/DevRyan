# packages/web/server/lib/text/

## Responsibility
Shared text summarization and sanitization utilities used by server features that need concise user-facing text.

## Design
- `summarization.js` centralizes prompt templates by mode (`tts`, `notification`, `note`).
- Sanitizers are mode-specific and intentionally strip markdown/unsafe tokens before fallback output.
- Runtime path prefers model-backed summarization, with deterministic fallback/clamping for timeout/error cases.

## Flow
1. Caller passes raw text + mode + limits to `summarizeText`.
2. If under threshold, module returns sanitized fallback directly.
3. Otherwise it sends a bounded-time request, extracts model text, sanitizes, and clamps length.
4. On failure, it returns mode-specific fallback instead of propagating transport errors.

## Integration
- Consumed by TTS and notification/server messaging paths.
- Tests in `summarization.test.js` lock prompt/sanitization/fallback behavior.
