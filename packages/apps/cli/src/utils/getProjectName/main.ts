import * as path from 'node:path';

import type { Failure, Success } from '@lumpcode/core';
import { execAsync, failure, success } from '@lumpcode/core';

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
 * Flag `--projectName` or infer from `origin` / directory basename.
 */
export async function resolveInferredProjectName(input: {
    projectRoot: string;
    explicitName?: string;
}): Promise<Success<string> | Failure<string>> {
    const trimmed = input.explicitName?.trim();
    if (trimmed) {
        if (!isValidProjectName(trimmed)) {
            return failure(
                'projectName must contain only letters, digits, underscores (_), and hyphens (-). Spaces and other characters are not allowed.',
            );
        }
        return success(trimmed);
    }

    const remoteResult = await execAsync('git remote get-url origin', { cwd: input.projectRoot });
    let raw: string | undefined;
    if (remoteResult.success && remoteResult.data.stdout.trim() !== '') {
        raw = rawRepoSegmentFromRemoteUrl(remoteResult.data.stdout);
    }
    if (!raw) {
        raw = path.basename(path.resolve(input.projectRoot));
    }

    const sanitized = sanitizeInferredProjectName(raw);
    if (!sanitized || !isValidProjectName(sanitized)) {
        return failure(
            'Could not derive a valid projectName from the git remote or directory name. Pass --projectName with only letters, digits, underscores, and hyphens.',
        );
    }
    return success(sanitized);
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
