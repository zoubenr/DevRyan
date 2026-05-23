import React from 'react';
import { describe, expect, test } from 'bun:test';
import { PatchFilesList } from './ActivityTargetLists';
import type { ChangedFile } from '../../changedFiles';

describe('PatchFilesList', () => {
    test('keeps changed file rows clickable without a hover fill', () => {
        const files: ChangedFile[] = [{
            path: 'src/example.ts',
            tool: 'apply_patch',
            partId: 'part-1',
            messageID: 'message-1',
            additions: 2,
            deletions: 1,
        }];
        const opened: ChangedFile[] = [];

        const element = PatchFilesList({
            files,
            currentDirectory: '/repo',
            onOpenFile: (file) => opened.push(file as ChangedFile),
        }) as React.ReactElement<{ children: React.ReactElement[] }>;

        const [row] = React.Children.toArray(element.props.children) as React.ReactElement<{
            className?: string;
            onClick?: () => void;
            type?: string;
        }>[];

        expect(row.type).toBe('button');
        expect(row.props.type).toBe('button');
        expect(row.props.className ?? '').not.toContain('hover:bg');
        expect(typeof row.props.onClick).toBe('function');

        row.props.onClick?.();

        expect(opened).toEqual([files[0]]);
    });
});
