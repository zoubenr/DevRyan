import type { ToolPart as ToolPartType } from '@opencode-ai/sdk/v2';
import { getToolLifecycleState } from '@/lib/toolStatus';

export const isToolPartFinalizedForDisplay = (toolPart: ToolPartType): boolean => {
  const state = (toolPart as Record<string, unknown>).state as Record<string, unknown> | undefined ?? {};
  return getToolLifecycleState(state).isFinalized;
};
