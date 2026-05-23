import React from 'react';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import {
    getDisplayPath,
    getFileStats,
    type ChangedFile,
    type ChangedFileEntry,
} from '../../changedFiles';
import { renderReadFilePath } from './activityPathUtils';

export interface ToolPathEntry {
    path: string;
    displayPath: string;
    offset?: number;
}

interface ToolPathListProps {
    entries: ToolPathEntry[];
    onOpenPath: (path: string, offset?: number) => void;
}

export const ToolPathList: React.FC<ToolPathListProps> = ({ entries, onOpenPath }) => {
    if (entries.length === 0) {
        return null;
    }

    return (
        <div className="space-y-0.5">
            {entries.map((entry) => (
                <button
                    key={entry.displayPath}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--interactive-hover)]"
                    title={entry.offset ? `${entry.displayPath}:${entry.offset}` : entry.displayPath}
                    onClick={() => onOpenPath(entry.path, entry.offset)}
                >
                    <FileTypeIcon filePath={entry.path} className="h-3.5 w-3.5 flex-shrink-0" />
                    {renderReadFilePath(entry.displayPath)}
                </button>
            ))}
        </div>
    );
};

export const ToolUrlList: React.FC<{ urls: string[] }> = ({ urls }) => {
    if (urls.length === 0) {
        return null;
    }

    return (
        <div className="space-y-0.5">
            {urls.map((url) => (
                <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--interactive-hover)]"
                    title={url}
                >
                    <span
                        className="min-w-0 flex-1 truncate whitespace-nowrap typography-meta leading-5 underline underline-offset-2"
                        style={{ color: 'var(--status-info)' }}
                    >
                        {url}
                    </span>
                </a>
            ))}
        </div>
    );
};

interface PatchFilesListProps {
    files: ChangedFile[];
    currentDirectory: string;
    onOpenFile: (file: ChangedFileEntry) => void;
}

export const PatchFilesList: React.FC<PatchFilesListProps> = ({ files, currentDirectory, onOpenFile }) => {
    if (files.length === 0) {
        return null;
    }

    return (
        <div className="space-y-0.5">
            {files.map((file, index) => {
                const { fileName, dirPart } = getDisplayPath(file, currentDirectory);
                const displayPath = dirPart ? `${dirPart}/${fileName}` : fileName;
                const stats = getFileStats(file);
                return (
                    <button
                        key={`${file.path}:${index}`}
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                        title={file.path}
                        onClick={() => onOpenFile(file)}
                    >
                        <FileTypeIcon filePath={file.path} className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="min-w-0 flex-1">{renderReadFilePath(displayPath)}</span>
                        {(stats.additions > 0 || stats.deletions > 0) ? (
                            <span className="flex-shrink-0 inline-flex items-baseline gap-1 typography-meta tabular-nums">
                                {stats.additions > 0 ? <span style={{ color: 'var(--status-success)' }}>+{stats.additions}</span> : null}
                                {stats.deletions > 0 ? <span style={{ color: 'var(--status-error)' }}>-{stats.deletions}</span> : null}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
};
