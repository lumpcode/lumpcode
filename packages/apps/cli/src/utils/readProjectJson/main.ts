import type { Failure, Success } from '@lumpcode/core';

import type { ProjectJsonConfig } from '../../types/ProjectJsonConfig';

export const PROJECT_JSON_FILE_NAME = 'project.json';

/**
 * Strict-validate `.lumpcode/project.json`.
 * Stub for clean-local-project-json-config (testImpl).
 */
export async function readProjectJson(_input: {
    localConfigFolderPath: string;
}): Promise<Success<ProjectJsonConfig> | Failure<string>> {
    throw new Error('not implemented');
}
