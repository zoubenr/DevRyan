import { describe, expect, test } from 'bun:test';

import { getMessageHeaderDisplay } from './messageHeaderDisplay';

describe('getMessageHeaderDisplay', () => {
    test('shows Antigravity identity for Google Antigravity model headers', () => {
        expect(getMessageHeaderDisplay({
            providerID: 'google',
            modelID: 'antigravity-gemini-3-flash',
            modelName: 'Gemini 3 Flash (Antigravity)',
        })).toEqual({
            providerID: 'antigravity',
            modelName: 'Gemini 3 Flash',
        });
    });

    test('keeps the Antigravity provider when detection comes from model id only', () => {
        expect(getMessageHeaderDisplay({
            providerID: 'google',
            modelID: 'antigravity-gemini-3-flash',
            modelName: 'Gemini 3 Flash',
        })).toEqual({
            providerID: 'antigravity',
            modelName: 'Gemini 3 Flash',
        });
    });

    test('leaves regular Google model headers unchanged', () => {
        expect(getMessageHeaderDisplay({
            providerID: 'google',
            modelID: 'gemini-3-pro',
            modelName: 'Gemini 3 Pro',
        })).toEqual({
            providerID: 'google',
            modelName: 'Gemini 3 Pro',
        });
    });
});
