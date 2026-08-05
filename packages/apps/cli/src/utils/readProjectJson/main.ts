import * as path from 'node:path';

import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { ProjectJsonConfig } from '../../types/ProjectJsonConfig';
import { formatZodIssues, projectJsonConfigSchema } from '../projectLocalConfigSchema';
import { readJsonFile } from '../readJsonFile';

export const PROJECT_JSON_FILE_NAME = 'project.json';

const MISSING_HINT =
    'Missing .lumpcode/project.json with a projectName. Run lumpcode project-setup in the repository root.';

/**
 * Strict-validate `.lumpcode/project.json`.
 */
export async function readProjectJson(input: {
    localConfigFolderPath: string;
}): Promise<Success<ProjectJsonConfig> | Failure<string>> {
    const filePath = path.join(input.localConfigFolderPath, PROJECT_JSON_FILE_NAME);

    const readResult = await readJsonFile<unknown>({
        filePath,
        missingFileFailure: MISSING_HINT,
    });
    if (!readResult.success) {
        return readResult;
    }

    const validated = projectJsonConfigSchema.safeParse(readResult.data);
    if (!validated.success) {
        return failure(`Invalid .lumpcode/project.json: ${formatZodIssues(validated.error)}`);
    }

    return success(validated.data);
}
