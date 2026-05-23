# packages/ui/src/components/chat/

## Responsibility
Implements the interactive chat surface: message timeline, composer/input, streaming status UI, permission/question blocking cards, and chat-specific navigation/scroll behavior.

## Design
- **Container + leaf split**: `ChatContainer.tsx` orchestrates state wiring, while specialized children (`MessageList`, `ChatInput`, `StatusRow*`, cards) handle focused rendering.
- **Performance-oriented memoization**: heavy/hot paths use `React.memo`, stable callbacks, and selector discipline to reduce render fanout during streaming.
- **Local domain helpers**: `lib/`, `hooks/`, and focused helpers such as `chatInputDraftPersistence.ts` encapsulate turn navigation, timeline, blocking requests, composer persistence, and scroll/follow logic.
- **Contract-aware message rendering**: message parts and tool activity rendering live under `message/parts/*` to map SDK part types to UI blocks.

## Flow
1. `ChatView` mounts `ChatContainer`.
2. `ChatContainer` reads current session, messages, status, and permissions/questions from sync + stores.
3. `MessageList` renders timeline; `ChatInput` prepares/queues/sends user prompts with attachments and model/agent config.
4. Streaming events update sync state; chat auto-follow and status overlays react to live deltas.

## Integration
- Primary integrations: `src/sync/*` (`sync-context`, streaming/session actions), `stores/*` (UI/config/queue/git/directory), and `lib/opencode/client`.
- Consumed by `components/views/ChatView.tsx` and embedded runtime shells.
- Collaborates with `components/session/*` (pickers), `components/ui/*` primitives, and `hooks/*` for keyboard/voice/activity behavior.
