# packages/web/server/lib/tts/

## Responsibility
Speech and summarization backend for text-to-speech APIs: OpenAI-backed voice generation, optional summarization pre-processing, and macOS `say` fallback endpoints.

## Design
- **Lazy service loading**: `routes.js` dynamically imports TTS service module to defer startup cost.
- **Validation-first endpoints**: normalize base URL, text payloads, voice/rate selections before runtime invocation.
- **Multi-provider pathing**: supports server key, client key, or custom base URL for speech generation.

## Flow
1. Client calls `/api/tts/speak` or `/api/text/summarize`.
2. Route validates request and optionally summarizes long content (`text/summarization.js`).
3. TTS service generates audio buffer; route writes binary response headers/body.
4. Status endpoints report service availability and macOS `say` capabilities.

## Integration
- Registered from `server/index.js` and consumed by UI voice features.
- Depends on text summarization helpers and OpenAI-compatible endpoints.
- Uses platform checks for local `say` command support.
