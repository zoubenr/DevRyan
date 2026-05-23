import type { ToolPart as ToolPartType } from '@opencode-ai/sdk/v2';
import type { TurnActivityRecord as TurnActivityPart } from '../../lib/turns/types';
import { getToolLifecycleState } from '@/lib/toolStatus';
import { normalizeToolName } from './toolRenderUtils';

export const getActivityToolPart = (activity: TurnActivityPart): ToolPartType => activity.part as ToolPartType;

export const getActivityToolName = (activity: TurnActivityPart): string => {
    const part = getActivityToolPart(activity);
    return normalizeToolName(part.tool);
};

export const getToolStateStatus = (part: ToolPartType): string | undefined => {
    const status = (part.state as { status?: unknown } | undefined)?.status;
    return typeof status === 'string' ? status : undefined;
};

export const isActivityRunning = (activity: TurnActivityPart): boolean => {
    if (activity.kind !== 'tool') return false;
    const part = getActivityToolPart(activity);
    const lifecycle = getToolLifecycleState(part.state as { status?: unknown; time?: { start?: unknown; end?: unknown } } | undefined);
    if (lifecycle.isFinalized) {
        return false;
    }
    if (lifecycle.isInFlight) {
        return true;
    }
    return typeof activity.endedAt !== 'number';
};

export const isPatchActivityFinalized = (activity: TurnActivityPart): boolean => {
    const part = getActivityToolPart(activity);
    const lifecycle = getToolLifecycleState(part.state as { status?: unknown; time?: { start?: unknown; end?: unknown } } | undefined);
    if (lifecycle.status === 'error' || lifecycle.status === 'failed') {
        return false;
    }
    return lifecycle.isFinalized || typeof activity.endedAt === 'number';
};
