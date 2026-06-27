import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('left sidebar project header icon', () => {
    test('keeps project icon visible when actions are always shown', () => {
        const source = readFileSync(resolve(testDir, 'sortableItems.tsx'), 'utf8');
        const iconBlock = source.slice(
            source.indexOf('data-project-header-icon'),
            source.indexOf('<span className={cn(', source.indexOf('data-project-header-icon')),
        );

        expect(iconBlock).toContain('data-project-header-icon');
        expect(iconBlock).not.toContain("alwaysShowActions ? 'hidden'");
        expect(iconBlock).not.toContain('group-hover/project:hidden');
    });
});
