import { describe, expect, test } from 'bun:test';

import { resolveMessageHeaderVariant, resolveMessageHeaderVariantDisplay } from './messageHeaderVariant';

describe('resolveMessageHeaderVariant', () => {
    test('keeps a recorded thinking level when the model supports it', () => {
        expect(resolveMessageHeaderVariant('high', ['minimal', 'low', 'medium', 'high'])).toBe('high');
    });

    test('uses medium as the visible header default when available', () => {
        expect(resolveMessageHeaderVariant(undefined, ['minimal', 'low', 'medium', 'high'])).toBe('medium');
    });

    test('uses the first supported thinking level when medium is unavailable', () => {
        expect(resolveMessageHeaderVariant(undefined, ['low', 'high'])).toBe('low');
    });

    test('hides the thinking badge for models without thinking variants', () => {
        expect(resolveMessageHeaderVariant(undefined, [])).toBe(undefined);
    });

    test('keeps fast separate from the visible thinking level', () => {
        expect(resolveMessageHeaderVariantDisplay({
            recordedVariant: 'fast',
            modelVariantOptions: ['low', 'medium'],
            fastEnabled: true,
        })).toEqual({
            fastEnabled: true,
            variant: 'medium',
        });
    });
});
