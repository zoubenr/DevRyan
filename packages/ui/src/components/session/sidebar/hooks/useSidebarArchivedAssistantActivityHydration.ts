import React from 'react';
import type { Message, Session } from '@opencode-ai/sdk/v2/client';
import { opencodeClient } from '@/lib/opencode/client';
import { getLastVisibleAssistantResponseAt, type SessionAssistantActivity } from '@/sync/session-assistant-activity';
import { stripMessageDiffSnapshots } from '@/sync/sanitize';
import { useChildStoreManager } from '@/sync/sync-context';
import { normalizePath } from '../utils';

const PAGE_SIZE = 50;
const MAX_PAGES_PER_SESSION = 8;
const MAX_CONCURRENT_REQUESTS = 3;

const getSessionDirectory = (session: Session): string | null => {
  const explicitDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
  const projectWorktree = normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);
  return explicitDirectory ?? projectWorktree;
};

const getParentSessionId = (session: Session): string => {
  return (session as Session & { parentID?: string | null }).parentID || session.id;
};

type HydrationCandidate =
  | { type: 'cached'; parentSessionId: string; value: number }
  | { type: 'fetch'; parentSessionId: string; parentSession: Session | undefined; directory: string; key: string };

async function fetchLastAssistantResponseAt(input: {
  parentSessionId: string;
  parentSession: Session | undefined;
  directory: string;
}): Promise<number | undefined> {
  const scopedClient = opencodeClient.getScopedSdkClient(input.directory);
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_SESSION; page += 1) {
    const result = await scopedClient.session.messages({ sessionID: input.parentSessionId, limit: PAGE_SIZE, before });
    const records = (result.data ?? []).filter((record: { info?: { id?: string } }) => !!record?.info?.id);
    const messages = records.map((record: { info: Message }) => stripMessageDiffSnapshots(record.info));
    const latest = getLastVisibleAssistantResponseAt(input.parentSession, messages);
    if (latest !== undefined) return latest;

    before = result.response?.headers?.get?.('x-next-cursor') ?? undefined;
    if (!before) return undefined;
  }

  return undefined;
}

export function useSidebarArchivedAssistantActivityHydration(
  activeSessions: Session[],
  archivedSessions: Session[],
): SessionAssistantActivity {
  const childStores = useChildStoreManager();
  const [activityByParentSessionId, setActivityByParentSessionId] = React.useState<SessionAssistantActivity>({});
  const inFlightRef = React.useRef(new Set<string>());
  const resolvedRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    let cancelled = false;

    const sessionsById = new Map<string, Session>();
    activeSessions.forEach((session) => sessionsById.set(session.id, session));
    archivedSessions.forEach((session) => sessionsById.set(session.id, session));

    const candidates: HydrationCandidate[] = [];
    archivedSessions.forEach((session) => {
      if (!session.time?.archived) return;
      const parentSessionId = getParentSessionId(session);
      if (activityByParentSessionId[parentSessionId] !== undefined) return;

      const parentSession = sessionsById.get(parentSessionId);
      const directory = (parentSession ? getSessionDirectory(parentSession) : null) ?? getSessionDirectory(session);
      if (!directory) return;

      const key = `${directory}\n${parentSessionId}`;
      if (resolvedRef.current.has(key) || inFlightRef.current.has(key)) return;

      const cachedMessages = childStores.getState(directory)?.message[parentSessionId];
      const cachedLatest = getLastVisibleAssistantResponseAt(parentSession, cachedMessages);
      if (cachedLatest !== undefined) {
        candidates.push({ type: 'cached', parentSessionId, value: cachedLatest });
        return;
      }

      candidates.push({ type: 'fetch', parentSessionId, parentSession, directory, key });
    });

    const cached = candidates.filter((item): item is Extract<typeof item, { type: 'cached' }> => item.type === 'cached');
    if (cached.length > 0) {
      setActivityByParentSessionId((current) => {
        let next: SessionAssistantActivity | null = null;
        cached.forEach((item) => {
          if ((next ?? current)[item.parentSessionId] === item.value) return;
          next = next ? { ...next, [item.parentSessionId]: item.value } : { ...current, [item.parentSessionId]: item.value };
        });
        return next ?? current;
      });
    }

    const fetchCandidates = candidates.filter((item): item is Extract<typeof item, { type: 'fetch' }> => item.type === 'fetch');
    if (fetchCandidates.length === 0) return;

    let cursor = 0;
    const runNext = async (): Promise<void> => {
      if (cancelled) return;
      const item = fetchCandidates[cursor];
      cursor += 1;
      if (!item) return;

      inFlightRef.current.add(item.key);
      try {
        const latest = await fetchLastAssistantResponseAt(item);
        if (cancelled) return;
        resolvedRef.current.add(item.key);
        if (latest !== undefined) {
          setActivityByParentSessionId((current) => (
            current[item.parentSessionId] === latest
              ? current
              : { ...current, [item.parentSessionId]: latest }
          ));
        }
      } catch {
        // Archived recency is non-critical; keep deterministic metadata fallback ordering.
      } finally {
        inFlightRef.current.delete(item.key);
        await runNext();
      }
    };

    for (let index = 0; index < Math.min(MAX_CONCURRENT_REQUESTS, fetchCandidates.length); index += 1) {
      void runNext();
    }

    return () => {
      cancelled = true;
    };
  }, [activeSessions, activityByParentSessionId, archivedSessions, childStores]);

  return activityByParentSessionId;
}
