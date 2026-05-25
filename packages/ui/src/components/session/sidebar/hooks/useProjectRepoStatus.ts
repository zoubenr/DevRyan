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

export type ProjectRootBranchRefreshSignature = {
  path: string;
  knownBranch: string | null;
};

type ProjectRootBranchRefreshTarget = Project & {
  knownBranch: string | null;
};

export const selectProjectsNeedingRootBranchRefresh = (args: {
  normalizedProjects: Project[];
  gitRepoStatus: Map<string, { isGitRepo: boolean | null; branch: string | null }>;
  previous: Map<string, ProjectRootBranchRefreshSignature>;
}): {
  changedProjects: ProjectRootBranchRefreshTarget[];
  next: Map<string, ProjectRootBranchRefreshSignature>;
} => {
  const next = new Map<string, ProjectRootBranchRefreshSignature>();
  const changedProjects: ProjectRootBranchRefreshTarget[] = [];

  for (const project of args.normalizedProjects) {
    const knownBranch = args.gitRepoStatus.get(project.normalizedPath)?.branch ?? null;
    const signature = {
      path: project.normalizedPath,
      knownBranch,
    };
    next.set(project.id, signature);

    const previous = args.previous.get(project.id);
    if (!previous || previous.path !== signature.path || previous.knownBranch !== signature.knownBranch) {
      changedProjects.push({ ...project, knownBranch });
    }
  }

  return { changedProjects, next };
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
  const rootBranchRefreshSignaturesRef = React.useRef<Map<string, ProjectRootBranchRefreshSignature>>(new Map());

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
    const { changedProjects, next } = selectProjectsNeedingRootBranchRefresh({
      normalizedProjects,
      gitRepoStatus,
      previous: rootBranchRefreshSignaturesRef.current,
    });
    rootBranchRefreshSignaturesRef.current = next;

    if (changedProjects.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      const run = async () => {
        const entries = await mapWithConcurrency(changedProjects, 2, async (project) => {
          const branch = await getRootBranch(project.normalizedPath, {
            knownBranch: project.knownBranch,
          }).catch(() => null);
          return { id: project.id, branch };
        });
        if (cancelled) {
          return;
        }
        setProjectRootBranches((prev) => {
          const nextBranches = new Map(prev);
          let changed = false;
          entries.forEach(({ id, branch }) => {
            if (branch && nextBranches.get(id) !== branch) {
              nextBranches.set(id, branch);
              changed = true;
            }
          });
          return changed ? nextBranches : prev;
        });
      };
      void run();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedProjects, projectGitBranchesKey, gitRepoStatus, setProjectRootBranches]);
};
