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

export const useProjectSessionLists = (args: Args) => {
  const {
    isVSCode,
    sessions,
    archivedSessions,
    availableWorktreesByProject,
  } = args;

  const sessionsByDirectory = React.useMemo(() => {
    const next = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const directory = normalizePath((session as Session & { directory?: string | null }).directory ?? null)
        ?? normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);
      if (!directory) {
        return;
      }

      const collection = next.get(directory) ?? [];
      collection.push(session);
      next.set(directory, collection);
    });
    return next;
  }, [sessions]);

  const archivedSessionsByDirectory = React.useMemo(() => {
    const next = new Map<string, Session[]>();
    archivedSessions.forEach((session) => {
      const directory = normalizePath((session as Session & { directory?: string | null }).directory ?? null)
        ?? normalizePath((session as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null);
      if (!directory) {
        return;
      }

      const collection = next.get(directory) ?? [];
      collection.push(session);
      next.set(directory, collection);
    });
    return next;
  }, [archivedSessions]);

  const collectSessionsForDirectories = React.useCallback(
    (directories: string[], source: Map<string, Session[]>) => {
      const seen = new Set<string>();
      const collected: Session[] = [];

      directories.forEach((directory) => {
        const sessionsForDirectory = source.get(directory) ?? [];
        sessionsForDirectory.forEach((session) => {
          if (seen.has(session.id)) {
            return;
          }
          seen.add(session.id);
          collected.push(session);
        });
      });

      return collected;
    },
    [],
  );

  const getSessionsForProject = React.useCallback(
    (project: { normalizedPath: string }) => {
      const worktreesForProject = isVSCode ? [] : (availableWorktreesByProject.get(project.normalizedPath) ?? []);
      const directories = [
        project.normalizedPath,
        ...worktreesForProject
          .map((meta) => normalizePath(meta.path) ?? meta.path)
          .filter((value): value is string => Boolean(value)),
      ];

      return collectSessionsForDirectories(directories, sessionsByDirectory);
    },
    [availableWorktreesByProject, collectSessionsForDirectories, isVSCode, sessionsByDirectory],
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
