import { beforeEach, describe, expect, test } from 'bun:test';
import type { Agent, Model, Provider } from '@opencode-ai/sdk/v2';
import { applyDraftAwareAgentChange, applyDraftAwareModelChange } from './draftAwareAgentChange';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveCurrentDraftSendConfig } from '@/sync/send-config';

type TestProvider = Omit<Provider, 'models'> & { models: Model[] };

const createModel = (providerID: string, id: string, variants?: Model['variants']): Model => ({
    id,
    providerID,
    api: { id: providerID, url: 'https://example.test', npm: providerID },
    name: id,
    capabilities: {
        temperature: true,
        reasoning: true,
        attachment: false,
        toolcall: true,
        input: { text: true, audio: false, image: false, video: false, pdf: false },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 1000, output: 1000 },
    status: 'active',
    options: {},
    headers: {},
    release_date: '2026-01-01',
    variants,
});

const providers: TestProvider[] = [
    {
        id: 'opencode',
        name: 'OpenCode',
        source: 'custom',
        options: {},
        env: [],
        models: [
            createModel('opencode', 'small'),
            createModel('opencode', 'builder-model', { high: {} }),
        ],
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        source: 'custom',
        options: {},
        env: [],
        models: [createModel('anthropic', 'claude')],
    },
];

const agents: Agent[] = [
    {
        name: 'Orchestrator',
        mode: 'primary',
        model: { providerID: 'opencode', modelID: 'small' },
        permission: [],
        options: {},
    },
    {
        name: 'Builder',
        mode: 'primary',
        model: { providerID: 'opencode', modelID: 'builder-model' },
        variant: 'high',
        permission: [],
        options: {},
    },
];

const DRAFT_ID = 'draft-cycle';

function selectionActions() {
    const selection = useSelectionStore.getState();
    return {
        setAgent: useConfigStore.getState().setAgent,
        saveSessionAgentSelection: selection.saveSessionAgentSelection,
        getDraftModelSelection: selection.getDraftModelSelection,
        saveDraftAgentSelection: selection.saveDraftAgentSelection,
        saveDraftModelSelection: selection.saveDraftModelSelection,
        saveDraftAgentModelForSelection: selection.saveDraftAgentModelForSelection,
        saveDraftAgentModelVariantForSelection: selection.saveDraftAgentModelVariantForSelection,
    };
}

function modelSelectionActions() {
    const selection = useSelectionStore.getState();
    return {
        setProviderModel: useConfigStore.getState().setProviderModel,
        saveSessionModelSelection: selection.saveSessionModelSelection,
        saveAgentModelForSession: selection.saveAgentModelForSession,
        saveAgentModelVariantForSession: selection.saveAgentModelVariantForSession,
        saveDraftModelSelection: selection.saveDraftModelSelection,
        saveDraftAgentModelForSelection: selection.saveDraftAgentModelForSelection,
        saveDraftAgentModelVariantForSelection: selection.saveDraftAgentModelVariantForSelection,
    };
}

describe('applyDraftAwareAgentChange', () => {
    beforeEach(() => {
        useSessionUIStore.setState({
            currentSessionId: null,
            currentDraftId: DRAFT_ID,
            newSessionDraft: { open: true, directoryOverride: '/repo', parentID: null },
        });
        useSelectionStore.setState({
            sessionModelSelections: new Map(),
            sessionAgentSelections: new Map(),
            sessionPlanModeSelections: new Map(),
            defaultPlanModeSelection: false,
            draftPlanModeSelection: false,
            sessionAgentModelSelections: new Map(),
            draftModelSelections: new Map(),
            draftAgentSelections: new Map(),
            draftAgentModelSelections: new Map(),
            draftAgentModelVariantSelections: new Map(),
            lastUsedProvider: null,
        });
        useConfigStore.setState({
            activeDirectoryKey: '__global__',
            providers,
            agents,
            settingsDefaultAgent: 'Orchestrator',
            currentAgentName: 'Orchestrator',
            currentProviderId: 'anthropic',
            currentModelId: 'claude',
            currentVariant: undefined,
            selectedProviderId: 'anthropic',
            directoryScoped: {},
        });
    });

    test('preserves a manually selected draft model when cycling agents on a new draft', () => {
        const selection = useSelectionStore.getState();
        selection.saveDraftModelSelection(DRAFT_ID, 'anthropic', 'claude');

        applyDraftAwareAgentChange(
            'Builder',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
            },
            selectionActions(),
        );

        expect(useConfigStore.getState().currentAgentName).toBe('Builder');
        expect(useConfigStore.getState().currentProviderId).toBe('anthropic');
        expect(useConfigStore.getState().currentModelId).toBe('claude');
        expect(selection.getDraftAgentSelection(DRAFT_ID)).toBe('Builder');
        expect(selection.getDraftModelSelection(DRAFT_ID)).toEqual({
            providerId: 'anthropic',
            modelId: 'claude',
        });
        expect(selection.getDraftAgentModelForSelection(DRAFT_ID, 'Builder')).toEqual({
            providerId: 'anthropic',
            modelId: 'claude',
        });
    });

    test('applies the selected agent configured model when no draft model was saved', () => {
        applyDraftAwareAgentChange(
            'Builder',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
            },
            selectionActions(),
        );

        expect(useConfigStore.getState().currentAgentName).toBe('Builder');
        expect(useConfigStore.getState().currentProviderId).toBe('opencode');
        expect(useConfigStore.getState().currentModelId).toBe('builder-model');
        expect(useConfigStore.getState().currentVariant).toBe('high');
        expect(useSelectionStore.getState().getDraftAgentSelection(DRAFT_ID)).toBe('Builder');
        expect(useSelectionStore.getState().getDraftModelSelection(DRAFT_ID)).toEqual({
            providerId: 'opencode',
            modelId: 'builder-model',
        });
    });

    test('records draft send config when cycling agents on a new draft', () => {
        const savedConfigs: Array<{
            draftId: string;
            sendConfig: {
                providerID?: string;
                modelID?: string;
                agent?: string;
                variant?: string;
            };
        }> = [];

        applyDraftAwareAgentChange(
            'Builder',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
            },
            {
                ...selectionActions(),
                saveDraftSendConfig: (draftId, sendConfig) => {
                    savedConfigs.push({ draftId, sendConfig });
                },
            },
        );

        expect(savedConfigs).toEqual([{
            draftId: DRAFT_ID,
            sendConfig: {
                providerID: 'opencode',
                modelID: 'builder-model',
                agent: 'Builder',
                variant: 'high',
            },
        }]);
    });

    test('promotes cycled draft agent and preserved model through draft send config', () => {
        const selection = useSelectionStore.getState();
        selection.saveDraftModelSelection(DRAFT_ID, 'anthropic', 'claude');

        applyDraftAwareAgentChange(
            'Builder',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
            },
            selectionActions(),
        );

        expect(resolveCurrentDraftSendConfig(DRAFT_ID)).toEqual({
            providerID: 'anthropic',
            modelID: 'claude',
            agent: 'Builder',
            variant: undefined,
            planMode: false,
        });
    });

    test('records keyboard-selected draft model for the current agent and draft send config', () => {
        const selection = useSelectionStore.getState();
        const savedConfigs: Array<{
            draftId: string;
            sendConfig: {
                providerID?: string;
                modelID?: string;
                agent?: string;
                variant?: string;
            };
        }> = [];

        applyDraftAwareModelChange(
            'anthropic',
            'claude',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
                currentAgentName: 'Orchestrator',
            },
            {
                ...modelSelectionActions(),
                saveDraftSendConfig: (draftId, sendConfig) => {
                    savedConfigs.push({ draftId, sendConfig });
                },
            },
        );

        expect(useConfigStore.getState().currentProviderId).toBe('anthropic');
        expect(useConfigStore.getState().currentModelId).toBe('claude');
        expect(selection.getDraftModelSelection(DRAFT_ID)).toEqual({
            providerId: 'anthropic',
            modelId: 'claude',
        });
        expect(selection.getDraftAgentModelForSelection(DRAFT_ID, 'Orchestrator')).toEqual({
            providerId: 'anthropic',
            modelId: 'claude',
        });
        expect(savedConfigs).toEqual([{
            draftId: DRAFT_ID,
            sendConfig: {
                providerID: 'anthropic',
                modelID: 'claude',
                agent: 'Orchestrator',
                variant: undefined,
            },
        }]);
    });

    test('keeps keyboard-selected draft model when Tab cycles the draft agent before send', () => {
        applyDraftAwareModelChange(
            'anthropic',
            'claude',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
                currentAgentName: 'Orchestrator',
            },
            {
                ...modelSelectionActions(),
                saveDraftSendConfig: (_draftId, sendConfig) => {
                    useSessionUIStore.getState().updateNewSessionDraftSendConfig(sendConfig);
                },
            },
        );

        applyDraftAwareAgentChange(
            'Builder',
            {
                currentSessionId: null,
                currentDraftId: DRAFT_ID,
                newSessionDraftOpen: true,
            },
            {
                ...selectionActions(),
                saveDraftSendConfig: (_draftId, sendConfig) => {
                    useSessionUIStore.getState().updateNewSessionDraftSendConfig(sendConfig);
                },
            },
        );

        expect(resolveCurrentDraftSendConfig(DRAFT_ID)).toEqual({
            providerID: 'anthropic',
            modelID: 'claude',
            agent: 'Builder',
            variant: undefined,
            planMode: false,
        });
    });

    test('saves session agent selection without draft preservation for established sessions', () => {
        useSessionUIStore.setState({
            currentSessionId: 'session-1',
            currentDraftId: null,
            newSessionDraft: { open: false, directoryOverride: null, parentID: null },
        });

        applyDraftAwareAgentChange(
            'Builder',
            {
                currentSessionId: 'session-1',
                currentDraftId: null,
                newSessionDraftOpen: false,
            },
            selectionActions(),
        );

        expect(useConfigStore.getState().currentAgentName).toBe('Builder');
        expect(useConfigStore.getState().currentProviderId).toBe('opencode');
        expect(useConfigStore.getState().currentModelId).toBe('builder-model');
        expect(useSelectionStore.getState().getSessionAgentSelection('session-1')).toBe('Builder');
    });
});
