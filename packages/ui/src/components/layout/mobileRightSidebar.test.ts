import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const readSource = (path: string) => readFileSync(resolve(testDir, path), 'utf8');

describe('mobile right sidebar layout', () => {
    test('mobile header tabs exclude files', () => {
        const source = readSource('Header.tsx');
        const tabsStart = source.indexOf('const tabs: TabConfig[] = React.useMemo(() => {');
        const mobileTabsBlock = source.slice(
            source.indexOf('if (isMobile) {', tabsStart),
            source.indexOf('// Desktop: no tabs in header', tabsStart),
        );

        expect(mobileTabsBlock).toContain("{ id: 'chat'");
        expect(mobileTabsBlock).toContain("{ id: 'diff'");
        expect(mobileTabsBlock).toContain("{ id: 'terminal'");
        expect(mobileTabsBlock).not.toContain("{ id: 'files'");
    });

    test('mobile right drawer uses desktop right sidebar tabs', () => {
        const source = readSource('MainLayout.tsx');
        const mobileRightDrawer = source.slice(
            source.indexOf('Right drawer (Source / Files)'),
            source.indexOf('{/* Main content area (fixed) */}'),
        );

        expect(mobileRightDrawer).toContain('<ErrorBoundary><RightSidebarTabs /></ErrorBoundary>');
        expect(mobileRightDrawer).not.toContain('<GitView />');
    });
});
