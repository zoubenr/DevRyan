import React from 'react';
import type { Message, Session } from '@opencode-ai/sdk/v2/client';
import { opencodeClient } from '@/lib/opencode/client';
import { useChildStoreManager } from '@/sync/sync-context';
import { getLastVisibleUserMessageAt } from '@/sync/session-user-activity';
import { stripMessageDiffSnapshots } from '@/sync/sanitize';
import { normalizePath } from '../utils';

const PAGE_SIZE = 50;
const MAX_PAGES_PER_SESSION = 8;
const MAX_CONCURRENT_REQUESTS = 3;

const getSessionDirectory = (session: Session): string | null => {
  const explicitDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
  const projectWorktree = normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);
  return explicitDirectory ?? projectWorktree;
};

const isRootSession = (session: Session): boolean => {
  return !((session as Session & { parentID?: string | null }).parentID);
};

async function fetchLastUserMessageAt(session: Session, directory: string): Promise<number | undefined> {
  const scopedClient = opencodeClient.getScopedSdkClient(directory);
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_SESSION; page += 1) {
    const result = await scopedClient.session.messages({ sessionID: session.id, limit: PAGE_SIZE, before });
    const records = (result.data ?? []).filter((record: { info?: { id?: string } }) => !!record?.info?.id);
    const messages = records.map((record: { info: Message }) => stripMessageDiffSnapshots(record.info));
    const latest = getLastVisibleUserMessageAt(session, messages);
    if (latest !== undefined) return latest;

    before = result.response?.headers?.get?.('x-next-cursor') ?? undefined;
    if (!before) return undefined;
  }

  return undefined;
}

export function useSidebarUserActivityHydration(
  sessions: Session[],
  activityBySessionId: Record<string, number>,
) {
  const childStores = useChildStoreManager();
  const inFlightRef = React.useRef(new Set<string>());
  const resolvedRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    let cancelled = false;

    const candidates = sessions.flatMap((session) => {
      if (!isRootSession(session) || activityBySessionId[session.id] !== undefined) return [];
      const directory = getSessionDirectory(session);
      if (!directory) return [];
      const key = `${directory}\n${session.id}`;
      if (resolvedRef.current.has(key) || inFlightRef.current.has(key)) return [];
      return [{ session, directory, key }];
    });

    if (candidates.length === 0) return;

    const results: Array<{ directory: string; sessionId: string; lastUserMessageAt: number }> = [];
    let cursor = 0;
    const runNext = async (): Promise<void> => {
      if (cancelled) return;
      const item = candidates[cursor];
      cursor += 1;
      if (!item) return;

      inFlightRef.current.add(item.key);
      try {
        const lastUserMessageAt = await fetchLastUserMessageAt(item.session, item.directory);
        if (cancelled) return;
        resolvedRef.current.add(item.key);
        if (lastUserMessageAt !== undefined) {
          results.push({
            directory: item.directory,
            sessionId: item.session.id,
            lastUserMessageAt,
          });
        }
      } catch {
        // Historical recency is non-critical; live user sends still update the index.
      } finally {
        inFlightRef.current.delete(item.key);
        await runNext();
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_REQUESTS, candidates.length) },
      () => runNext(),
    );

    void Promise.all(workers).then(() => {
      if (cancelled || results.length === 0) return;

      const resultsByDirectory = new Map<string, Map<string, number>>();
      results.forEach(({ directory, sessionId, lastUserMessageAt }) => {
        let directoryResults = resultsByDirectory.get(directory);
        if (!directoryResults) {
          directoryResults = new Map<string, number>();
          resultsByDirectory.set(directory, directoryResults);
        }
        directoryResults.set(sessionId, lastUserMessageAt);
      });

      resultsByDirectory.forEach((directoryResults, directory) => {
        const store = childStores.ensureChild(directory, { bootstrap: false });
        store.setState((state) => {
          let changed = false;
          const nextActivity = { ...state.session_user_activity };

          directoryResults.forEach((lastUserMessageAt, sessionId) => {
            if (nextActivity[sessionId] !== lastUserMessageAt) {
              nextActivity[sessionId] = lastUserMessageAt;
              changed = true;
            }
          });

          if (!changed) return state;

          return {
            session_user_activity: nextActivity,
          };
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activityBySessionId, childStores, sessions]);
}
