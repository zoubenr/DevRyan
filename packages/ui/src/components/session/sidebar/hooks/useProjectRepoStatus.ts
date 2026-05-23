import React from 'react';
import { getRootBranch } from '@/lib/worktrees/worktreeStatus';
import { mapWithConcurrency } from '@/lib/concurrency';
import { useGitStore } from '@/stores/useGitStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

type Project = { id: string; path: string; normalizedPath: string };

type Args = {
  normalizedProjects: Project[];
  gitRepoStatus: Map<string, { isGitRepo: boolean | null; branch: string | null }>;
  setProjectRepoStatus: React.Dispatch<React.SetStateAction<Map<string, boolean | null>>>;
  setProjectRootBranches: React.Dispatch<React.SetStateAction<Map<string, string>>>;
};

const areRepoStatusMapsEqual = (
  left: Map<string, boolean | null>,
  right: Map<string, boolean | null>,
): boolean => {
  if (left.size !== right.size) return false;

  for (const [key, value] of left) {
    if (!right.has(key) || right.get(key) !== value) return false;
  }

  return true;
};

export const useProjectRepoStatus = (args: Args): void => {
  const {
    normalizedProjects,
    gitRepoStatus,
    setProjectRepoStatus,
    setProjectRootBranches,
  } = args;

  const { git } = useRuntimeAPIs();
  const ensureStatus = useGitStore((state) => state.ensureStatus);

  // Derive repo status from centralized Git store
  React.useEffect(() => {
    if (!git || normalizedProjects.length === 0) {
      setProjectRepoStatus((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }

    // Trigger ensureStatus for each project to populate store
    normalizedProjects.forEach((project) => {
      void ensureStatus(project.normalizedPath, git);
    });
  }, [normalizedProjects, git, ensureStatus, setProjectRepoStatus]);

  // Read isGitRepo from the store-populated state
  React.useEffect(() => {
    const next = new Map<string, boolean | null>();
    normalizedProjects.forEach((project) => {
      next.set(project.id, gitRepoStatus.get(project.normalizedPath)?.isGitRepo ?? null);
    });
    setProjectRepoStatus((prev) => (areRepoStatusMapsEqual(prev, next) ? prev : next));
  }, [normalizedProjects, gitRepoStatus, setProjectRepoStatus]);

  const projectGitBranchesKey = React.useMemo(() => {
    return normalizedProjects
      .map((project) => {
        const branch = gitRepoStatus.get(project.normalizedPath)?.branch ?? '';
        return `${project.id}:${branch}`;
      })
      .join('|');
  }, [normalizedProjects, gitRepoStatus]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const entries = await mapWithConcurrency(normalizedProjects, 2, async (project) => {
        const branch = await getRootBranch(project.normalizedPath).catch(() => null);
        return { id: project.id, branch };
      });
      if (cancelled) {
        return;
      }
      setProjectRootBranches((prev) => {
        const next = new Map(prev);
        let changed = false;
        entries.forEach(({ id, branch }) => {
          if (branch && next.get(id) !== branch) {
            next.set(id, branch);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [normalizedProjects, projectGitBranchesKey, setProjectRootBranches]);
};
