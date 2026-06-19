import * as fs from 'node:fs/promises';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { ProjectConfig } from '../../types/ProjectConfig';
import { projectJsonPath } from '../projectJsonPath';
import { readJson } from '../readJson';

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

const invalidProjectNameMessage =
    'Invalid projectName in .lumpcode/project.json: use only letters, digits, underscores (_), and hyphens (-), with no spaces. Edit project.json or re-run lumpcode project-setup.';

export async function getProjectName(input: {
    localConfigFolderPath: string;
    projectRoot: string;
}): Promise<Success<string> | Failure<string>> {
    const { localConfigFolderPath } = input;
    const projectJsonFilePath = projectJsonPath({ localConfigFolderPath });

    const jsonExists = await fs.access(projectJsonFilePath).then(() => true).catch(() => false);
    if (!jsonExists) {
        return failure(
            'Missing .lumpcode/project.json with a projectName. Run lumpcode project-setup in the repository root.',
        );
    }

    const readResult = await readJson<ProjectConfig>(projectJsonFilePath);
    if (!readResult.success) {
        return failure(readResult.data.message ?? 'Failed to read project.json');
    }

    const projectName = readResult.data.projectName?.trim();
    if (!projectName) {
        return failure(
            'project.json must set projectName (non-empty). Run lumpcode project-setup or add projectName to .lumpcode/project.json.',
        );
    }

    if (!isValidProjectName(projectName)) {
        return failure(invalidProjectNameMessage);
    }

    return success(projectName);
}
