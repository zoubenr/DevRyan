import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(testDir, 'ModelControls.tsx'), 'utf8');

describe('ModelControls Cursor fast-only controls', () => {
    test('uses the Cursor display label helper for the model-adjacent variant trigger', () => {
        const code = source();

        expect(code).toContain('getCursorAcpVariantDisplayLabel(cursorVariantState)');
        expect(code).toContain('getCursorAcpVariantDisplayLabel(cursorRowVariantState)');
    });

    test('renders a Cursor Fast switch in the mobile expanded model row', () => {
        const code = source();

        expect(code).toContain('cursorVariantState?.canToggleFast && provider');
        expect(code).toContain('resolveCursorAcpVariantSelection(provider, modelId, resolvedVariant, { fastEnabled: checked })');
    });

    test('does not render visible Thinking headers or labels in variant controls', () => {
        const code = source();

        expect(code).not.toContain('<DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">{t(\'chat.modelControls.thinking\')}</DropdownMenuLabel>');
        expect(code).not.toContain('<p className="typography-meta">Thinking: {displayVariant}</p>');
        expect(code).not.toContain('<span className="font-medium text-foreground">{t(\'chat.modelControls.thinking\')}</span>');
        expect(code).not.toContain('<span>Thinking: {displayLabel}</span>');
        expect(code).not.toContain("const mobileVariantPanelTitle = cursorFastOnlyPanelTitle ?? t('chat.modelControls.thinking')");
    });

    test('uses the larger model-control fast icon size', () => {
        const code = source();

        expect(code).toContain('inline-flex h-3.5 w-3.5');
        expect(code).toContain('RiFlashlightFill className="h-3.5 w-3.5 text-[var(--status-warning)]"');
    });
});
