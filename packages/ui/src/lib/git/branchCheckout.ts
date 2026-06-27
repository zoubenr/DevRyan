import type { GitAPI, GitStatus } from '@/lib/api/types';
import type { SessionWorktreeAttachment } from '@/stores/types/sessionTypes';
import {
  getMutationBlockingReasons,
  type MutationBlockingReason,
} from '@/sync/session-worktree-contract';

export type BranchCheckoutResult =
  | { type: 'already-current'; branch: string }
  | { type: 'blocked'; branch: string; reason: string }
  | { type: 'needs-stash'; branch: string; dirtyFiles?: number }
  | { type: 'checked-out'; branch: string; stashed: boolean; restored: boolean }
  | { type: 'restore-failed'; branch: string; error: unknown };

export type BranchCheckoutOptions = {
  git: GitAPI;
  directory: string;
  branch: string;
  status?: GitStatus | null;
  attachment?: SessionWorktreeAttachment | null;
  stashConfirmed?: boolean;
  restoreAfter?: boolean;
};

export function normalizeCheckoutBranchName(branch: string): string {
  return branch.trim().replace(/^remotes\//, '');
}

export function formatMutationBlockingReason(reason: MutationBlockingReason): string {
  if (reason.reason === 'attention') {
    return `${reason.attentionReason} in progress`;
  }
  if (reason.reason === 'missing') {
    return 'worktree is missing';
  }
  if (reason.reason === 'dirty') {
    if (typeof reason.dirtyFiles === 'number') {
      return `${reason.dirtyFiles} changed ${reason.dirtyFiles === 1 ? 'file' : 'files'}`;
    }
    return 'worktree has uncommitted changes';
  }
  return 'worktree is invalid';
}

export async function checkoutBranchWithOptionalStash({
  git,
  directory,
  branch,
  status,
  attachment,
  stashConfirmed = false,
  restoreAfter = false,
}: BranchCheckoutOptions): Promise<BranchCheckoutResult> {
  const normalized = normalizeCheckoutBranchName(branch);

  if (!normalized) {
    return { type: 'blocked', branch: normalized, reason: 'branch is required' };
  }

  if (status?.current === normalized) {
    return { type: 'already-current', branch: normalized };
  }

  const blockingReasons = getMutationBlockingReasons(attachment, status ?? undefined);
  const nonDirtyReason = blockingReasons.find((reason) => reason.reason !== 'dirty');
  if (nonDirtyReason) {
    return { type: 'blocked', branch: normalized, reason: formatMutationBlockingReason(nonDirtyReason) };
  }

  const dirtyReason = blockingReasons.find((reason) => reason.reason === 'dirty');
  if (dirtyReason && !stashConfirmed) {
    return { type: 'needs-stash', branch: normalized, dirtyFiles: dirtyReason.dirtyFiles };
  }

  const shouldStash = Boolean(dirtyReason && stashConfirmed);

  if (shouldStash) {
    await git.stash(directory, {
      message: `Auto-stash before checkout ${normalized}`,
      includeUntracked: true,
    });
  }

  await git.checkoutBranch(directory, normalized);

  if (shouldStash && restoreAfter) {
    try {
      await git.stashPop(directory);
    } catch (error) {
      return { type: 'restore-failed', branch: normalized, error };
    }
  }

  return {
    type: 'checked-out',
    branch: normalized,
    stashed: shouldStash,
    restored: shouldStash && restoreAfter,
  };
}
