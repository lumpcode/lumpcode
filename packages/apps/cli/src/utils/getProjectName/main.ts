import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { readProjectJson } from '../readProjectJson';

const VALID_PROJECT_NAME = /^[a-zA-Z0-9_-]+$/;

export function isValidProjectName(name: string): boolean {
    return VALID_PROJECT_NAME.test(name);
}

/** Normalizes an inferred label (git URL segment or directory name) into a valid `projectName`. */
export function sanitizeInferredProjectName(raw: string): string {
    return raw
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function rawRepoSegmentFromRemoteUrl(url: string): string | undefined {
    const trimmed = url.trim();
    const withoutGit = trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed;
    const segment = withoutGit.split(/[/:]/).filter(Boolean).pop();
    return segment;
}

/**
 * Reads and returns `projectName` from `.lumpcode/project.json` via strict `readProjectJson`.
 */
export async function getProjectName(input: {
    localConfigFolderPath: string;
    projectRoot: string;
}): Promise<Success<string> | Failure<string>> {
    const { localConfigFolderPath } = input;
    const result = await readProjectJson({ localConfigFolderPath });
    if (!result.success) {
        return result;
    }
    return success(result.data.projectName);
}
