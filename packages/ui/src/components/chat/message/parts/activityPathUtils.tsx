import React from 'react';

export const normalizePathValue = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
};

const trimTrailingSlashes = (value: string): string => {
    if (value === '/') {
        return value;
    }
    return value.replace(/\/+$/, '');
};

export const getRelativePathFromDirectory = (filePath: string, currentDirectory: string): string => {
    const normalizedPath = trimTrailingSlashes(normalizePathValue(filePath));
    const normalizedDirectory = trimTrailingSlashes(normalizePathValue(currentDirectory));

    if (!normalizedPath) {
        return '';
    }

    if (!normalizedDirectory) {
        return normalizedPath;
    }

    if (normalizedPath === normalizedDirectory) {
        return '.';
    }

    const prefix = `${normalizedDirectory}/`;
    if (normalizedPath.startsWith(prefix)) {
        return normalizedPath.slice(prefix.length);
    }

    return normalizedPath;
};

export const renderReadFilePath = (displayPath: string) => {
    const lastSlash = displayPath.lastIndexOf('/');

    if (lastSlash === -1) {
        return (
            <span
                className="min-w-0 flex-1 truncate whitespace-nowrap typography-meta leading-5"
                style={{ color: 'var(--tools-title)' }}
                title={displayPath}
                aria-label={displayPath}
            >
                {displayPath}
            </span>
        );
    }

    const dir = displayPath.slice(0, lastSlash);
    const name = displayPath.slice(lastSlash + 1);
    const hasAbsoluteRoot = dir.startsWith('/');
    const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir;

    return (
        <span className="min-w-0 inline-flex max-w-full flex-1 items-baseline overflow-hidden typography-meta leading-5" title={displayPath} aria-label={displayPath}>
            {hasAbsoluteRoot ? <span className="flex-shrink-0" style={{ color: 'var(--tools-description)' }} aria-hidden="true">/</span> : null}
            <span
                className="min-w-0 shrink truncate whitespace-nowrap"
                style={{
                    color: 'var(--tools-description)',
                    direction: 'rtl',
                    textAlign: 'left',
                    unicodeBidi: 'plaintext',
                }}
                aria-hidden="true"
            >
                {displayDir}
            </span>
            <span className="flex-shrink-0" style={{ color: 'var(--tools-description)' }} aria-hidden="true">/</span>
            <span className="flex-shrink-0" style={{ color: 'var(--tools-title)' }}>{name}</span>
        </span>
    );
};

export const resolveAbsolutePath = (currentDirectory: string, filePath: string): string => {
    const normalizedPath = normalizePathValue(filePath);
    if (!normalizedPath) {
        return '';
    }
    if (normalizedPath.startsWith('/')) {
        return normalizedPath;
    }
    const normalizedDirectory = normalizePathValue(currentDirectory);
    if (!normalizedDirectory) {
        return normalizedPath;
    }
    return normalizedDirectory.endsWith('/') ? `${normalizedDirectory}${normalizedPath}` : `${normalizedDirectory}/${normalizedPath}`;
};

export const getContextDirectoryForPath = (currentDirectory: string, absolutePath: string): string => {
    const normalizedDirectory = normalizePathValue(currentDirectory);
    if (normalizedDirectory) {
        return normalizedDirectory;
    }

    const normalizedPath = normalizePathValue(absolutePath);
    if (!normalizedPath) {
        return '';
    }
    const parent = normalizedPath.replace(/\/[^/]*$/, '');
    return parent || normalizedPath;
};
