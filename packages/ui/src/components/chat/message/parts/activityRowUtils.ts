import type { ToolPart as ToolPartType } from '@opencode-ai/sdk/v2';
import type { TurnActivityRecord as TurnActivityPart } from '../../lib/turns/types';
import { areRenderRelevantPartsEqual } from '../renderCompare';

export const getToolReadOffset = (activity: TurnActivityPart): number | undefined => {
    const part = activity.part as ToolPartType;
    const state = part.state as { input?: Record<string, unknown>; metadata?: Record<string, unknown> } | undefined;
    const input = state?.input;
    const metadata = state?.metadata;

    const rawOffset =
        (typeof input?.offset === 'number' && Number.isFinite(input.offset) ? input.offset : undefined)
        ?? (typeof input?.line === 'number' && Number.isFinite(input.line) ? input.line : undefined)
        ?? (typeof metadata?.offset === 'number' && Number.isFinite(metadata.offset) ? metadata.offset : undefined)
        ?? (typeof metadata?.line === 'number' && Number.isFinite(metadata.line) ? metadata.line : undefined);

    if (typeof rawOffset !== 'number' || rawOffset <= 0) {
        return undefined;
    }

    return Math.floor(rawOffset);
};

export const areActivityListsEqual = (left: TurnActivityPart[], right: TurnActivityPart[]): boolean => {
    if (left === right) {
        return true;
    }

    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        const leftActivity = left[index];
        const rightActivity = right[index];

        if (leftActivity.id !== rightActivity.id) {
            return false;
        }

        if (leftActivity.kind !== rightActivity.kind || leftActivity.endedAt !== rightActivity.endedAt) {
            return false;
        }

        if (!areRenderRelevantPartsEqual([leftActivity.part], [rightActivity.part])) {
            return false;
        }
    }

    return true;
};
