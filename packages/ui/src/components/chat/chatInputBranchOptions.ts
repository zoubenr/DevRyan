const DRAFT_BRANCH_OPTION_PREFIX = 'branch:';

export type DraftLocalBranchOption = {
  value: string;
  label: string;
};

export function encodeDraftBranchOptionValue(branch: string): string {
  return `${DRAFT_BRANCH_OPTION_PREFIX}${branch}`;
}

export function decodeDraftBranchOptionValue(value: string): string | null {
  if (!value.startsWith(DRAFT_BRANCH_OPTION_PREFIX)) {
    return null;
  }
  const branch = value.slice(DRAFT_BRANCH_OPTION_PREFIX.length).trim();
  return branch || null;
}

export function buildDraftLocalBranchOptions(input: {
  allBranches: string[];
  currentBranch: string;
}): DraftLocalBranchOption[] {
  const current = input.currentBranch.trim();
  return input.allBranches
    .filter((branch) => branch && !branch.startsWith('remotes/'))
    .filter((branch) => branch !== current)
    .sort((a, b) => a.localeCompare(b))
    .map((branch) => ({
      value: encodeDraftBranchOptionValue(branch),
      label: branch,
    }));
}
