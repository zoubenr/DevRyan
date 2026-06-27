import type { Agent } from '@opencode-ai/sdk/v2';
import type { AgentSelectionOption } from '@/lib/agentSelection';
import {
    findSelectableAgentByName,
    isHiddenBuiltinAgentOption,
    resolveDefaultAgentName,
} from '@/lib/agentSelection';

export {
    compareAgentOptions,
    findSelectableAgentByName,
    isBuilderAgentName,
    isHiddenBuiltinAgentOption,
    isSelectablePrimaryAgentOption,
    normalizeAgentName,
    resolveDefaultAgentName,
    resolveSelectableAgentOptions,
} from '@/lib/agentSelection';

export const resolveAgentDisplayNameCandidate = <T extends AgentSelectionOption>(
    currentAgentName: string | undefined,
    defaultAgentName: string | undefined,
    selectableAgents: T[],
) => {
    if (currentAgentName && !isHiddenBuiltinAgentOption(currentAgentName)) {
        return currentAgentName;
    }

    const resolvedDefaultName = resolveDefaultAgentName(defaultAgentName, selectableAgents);
    const resolvedDefaultAgent = findSelectableAgentByName(selectableAgents, resolvedDefaultName);
    return resolvedDefaultAgent?.name ?? selectableAgents[0]?.name;
};

export type { Agent };
