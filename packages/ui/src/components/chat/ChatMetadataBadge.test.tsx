import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, 'ChatMetadataBadge.tsx'), 'utf8');

describe('ChatMetadataBadge', () => {
    test('does not push the thinking label below the model label baseline', () => {
        const code = source();

        expect(code).toContain('inline-flex min-w-0 items-baseline gap-1 leading-none');
        expect(code).toContain('max-w-[96px]');
        expect(code).toContain('text-[10px]');
        expect(code).not.toContain('translate-y-px');
    });

    test('renders a trailing icon after the thinking label', () => {
        const code = source();

        expect(code).toContain('trailingIcon?: React.ReactNode');
        expect(code).toContain('{trailingIcon ? (');
        expect(code.indexOf('{thinkingLabel ? (')).toBeLessThan(code.indexOf('{trailingIcon ? ('));
    });
});
