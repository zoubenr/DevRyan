import type { GitStatusFile } from "@/lib/api/types"

export type CommitWorkflowSafetyReport = {
  blockingPaths: string[]
  runtimeNoisePaths: string[]
}

const normalizeGitPath = (value: string): string => value.replace(/\\/g, "/").replace(/^\.\/+/, "").trim()

export const isCommitWorkflowRuntimeNoisePath = (path: string): boolean => {
  const normalized = normalizeGitPath(path)
  return /^\.superpowers\/brainstorm\/[^/]+\/state\/[^/]+$/.test(normalized)
}

const isStagedChange = (file: Pick<GitStatusFile, "index">): boolean => {
  const index = typeof file.index === "string" ? file.index.trim() : ""
  return index.length > 0 && index !== "?"
}

export const shouldAutoSelectGitChange = (file: Pick<GitStatusFile, "path" | "index" | "working_dir">): boolean => {
  return !isCommitWorkflowRuntimeNoisePath(file.path)
}

export const buildCommitWorkflowSafetyReport = ({
  selectedPaths,
  statusFiles,
}: {
  selectedPaths: string[]
  statusFiles: Array<Pick<GitStatusFile, "path" | "index" | "working_dir">>
}): CommitWorkflowSafetyReport => {
  const selectedSet = new Set(selectedPaths.map(normalizeGitPath).filter(Boolean))
  const blockingPaths: string[] = []
  const runtimeNoisePaths: string[] = []

  for (const file of statusFiles) {
    const path = normalizeGitPath(file.path)
    if (!path || selectedSet.has(path)) {
      continue
    }

    const runtimeNoise = isCommitWorkflowRuntimeNoisePath(path)
    if (runtimeNoise) {
      runtimeNoisePaths.push(path)
    }

    if (isStagedChange(file)) {
      blockingPaths.push(path)
    }
  }

  return {
    blockingPaths: Array.from(new Set(blockingPaths)).sort(),
    runtimeNoisePaths: Array.from(new Set(runtimeNoisePaths)).sort(),
  }
}
