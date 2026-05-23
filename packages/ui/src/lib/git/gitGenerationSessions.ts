/** Ephemeral OpenCode sessions used for Git commit message/plan generation (hidden from sidebar). */

export const GIT_GENERATION_SESSION_TITLE = 'Commit generation workflow';

const gitGenerationSessionIds = new Set<string>();

export const registerGitGenerationSession = (sessionId: string): void => {
  const trimmed = sessionId.trim();
  if (!trimmed) return;
  gitGenerationSessionIds.add(trimmed);
};

export const unregisterGitGenerationSession = (sessionId: string): void => {
  const trimmed = sessionId.trim();
  if (!trimmed) return;
  gitGenerationSessionIds.delete(trimmed);
};

export const isGitGenerationSession = (sessionId: string | null | undefined): boolean => {
  if (!sessionId) return false;
  return gitGenerationSessionIds.has(sessionId);
};

export const isGitGenerationSessionRecord = (
  session: { id?: string | null; title?: string | null } | null | undefined,
): boolean => {
  if (!session) return false;
  if (isGitGenerationSession(session.id)) return true;
  return typeof session.title === 'string' && session.title.trim() === GIT_GENERATION_SESSION_TITLE;
};
