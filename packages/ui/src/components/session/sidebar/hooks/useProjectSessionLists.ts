import React from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import { dedupeSessionsById, isSessionRelatedToProject, normalizePath } from '../utils';

type WorktreeMeta = { path: string };

type Args = {
  isVSCode: boolean;
  sessions: Session[];
  archivedSessions: Session[];
  availableWorktreesByProject: Map<string, WorktreeMeta[]>;
};

type SessionWithProject = Session & {
  directory?: string | null;
  parentID?: string | null;
  project?: { worktree?: string | null } | null;
};

const resolveSessionDirectory = (session: Session): string | null => {
  const record = session as SessionWithProject;
  return normalizePath(record.directory ?? null)
    ?? normalizePath(record.project?.worktree ?? null);
};

const resolveSessionParentId = (session: Session): string | null => (
  (session as SessionWithProject).parentID ?? null
);

export const collectProjectSessionsForDirectories = (
  sessions: Session[],
  directories: string[],
): Session[] => {
  const directorySet = new Set(
    directories
      .map((directory) => normalizePath(directory))
      .filter((directory): directory is string => Boolean(directory)),
  );
  if (directorySet.size === 0) {
    return [];
  }

  const selected: Session[] = [];
  const selectedIds = new Set<string>();
  const addSelected = (session: Session): void => {
    if (selectedIds.has(session.id)) {
      return;
    }
    selectedIds.add(session.id);
    selected.push(session);
  };

  for (const session of sessions) {
    const directory = resolveSessionDirectory(session);
    if (directory && directorySet.has(directory)) {
      addSelected(session);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const session of sessions) {
      if (selectedIds.has(session.id) || resolveSessionDirectory(session)) {
        continue;
      }
      const parentID = resolveSessionParentId(session);
      if (parentID && selectedIds.has(parentID)) {
        addSelected(session);
        changed = true;
      }
    }
  }

  return selected;
};

export const useProjectSessionLists = (args: Args) => {
  const {
    isVSCode,
    sessions,
    archivedSessions,
    availableWorktreesByProject,
  } = args;

  const archivedSessionsByDirectory = React.useMemo(() => {
    const next = new Map<string, Session[]>();
    archivedSessions.forEach((session) => {
      const directory = resolveSessionDirectory(session);
      if (!directory) {
        return;
      }

      const collection = next.get(directory) ?? [];
      collection.push(session);
      next.set(directory, collection);
    });
    return next;
  }, [archivedSessions]);

  const getSessionsForProject = React.useCallback(
    (project: { normalizedPath: string }) => {
      const worktreesForProject = isVSCode ? [] : (availableWorktreesByProject.get(project.normalizedPath) ?? []);
      const directories = [
        project.normalizedPath,
        ...worktreesForProject
          .map((meta) => normalizePath(meta.path) ?? meta.path)
          .filter((value): value is string => Boolean(value)),
      ];

      return collectProjectSessionsForDirectories(sessions, directories);
    },
    [availableWorktreesByProject, isVSCode, sessions],
  );

  const getArchivedSessionsForProject = React.useCallback(
    (project: { normalizedPath: string }) => {
      if (isVSCode) {
        const archived = archivedSessions.filter((session) => {
          const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
          const projectWorktree = normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);

          if (sessionDirectory) {
            return sessionDirectory === project.normalizedPath;
          }

          return projectWorktree === project.normalizedPath;
        });

        const unassignedLive = sessions.filter((session) => {
          if (session.time?.archived) {
            return false;
          }
          const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
          if (sessionDirectory) {
            return false;
          }
          const projectWorktree = normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);
          return projectWorktree === project.normalizedPath;
        });

        return dedupeSessionsById([...archived, ...unassignedLive]);
      }

      const worktreesForProject = isVSCode ? [] : (availableWorktreesByProject.get(project.normalizedPath) ?? []);
      const validDirectories = new Set<string>([
        project.normalizedPath,
        ...worktreesForProject
          .map((meta) => normalizePath(meta.path) ?? meta.path)
          .filter((value): value is string => Boolean(value)),
      ]);

      const archived: Session[] = [];
      archivedSessionsByDirectory.forEach((sessionsForDirectory, directory) => {
        if (
          !validDirectories.has(directory)
          && directory !== project.normalizedPath
          && !directory.startsWith(`${project.normalizedPath}/`)
        ) {
          return;
        }

        sessionsForDirectory.forEach((session) => {
          if (isSessionRelatedToProject(session, project.normalizedPath, validDirectories)) {
            archived.push(session);
          }
        });
      });
      const unassignedLive = sessions.filter((session) => {
        if (session.time?.archived) {
          return false;
        }
        const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
        if (sessionDirectory) {
          return false;
        }
        const projectWorktree = normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);
        if (!projectWorktree) {
          return false;
        }
        return projectWorktree === project.normalizedPath || projectWorktree.startsWith(`${project.normalizedPath}/`);
      });

      return dedupeSessionsById([...archived, ...unassignedLive]);
    },
    [archivedSessions, archivedSessionsByDirectory, availableWorktreesByProject, isVSCode, sessions],
  );

  return {
    getSessionsForProject,
    getArchivedSessionsForProject,
  };
};
