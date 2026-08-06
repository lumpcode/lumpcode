import * as path from 'node:path';

import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import { formatZodIssues, localJsonConfigSchema } from '../projectLocalConfigSchema';
import { readJsonFile } from '../readJsonFile';

const MISSING_HINT =
    'Missing .lumpcode/local.json. Run `lumpcode project-setup` to scaffold it, or create it with { "mode": "shared" | "dedicated" }.';

export const LOCAL_CONFIG_FILE_NAME = 'local.json';

/**
 * Strict-validate `.lumpcode/local.json`.
 * Primary branch is optional here; merged presence is enforced by `readProjectLocalConfig`.
 * `workspaceStrategy` defaults to `checkout` when omitted (same as today).
 */
export async function readLocalConfig(input: {
    localConfigFolderPath: string;
}): Promise<Success<LocalConfig> | Failure<string>> {
    const filePath = path.join(input.localConfigFolderPath, LOCAL_CONFIG_FILE_NAME);

    const readResult = await readJsonFile<unknown>({
        filePath,
        missingFileFailure: MISSING_HINT,
    });
    if (!readResult.success) {
        return readResult;
    }

    const validated = localJsonConfigSchema.safeParse(readResult.data);
    if (!validated.success) {
        return failure(`Invalid .lumpcode/local.json: ${formatZodIssues(validated.error)}`);
    }

    const data: LocalConfig = {
        ...validated.data,
        workspaceStrategy: validated.data.workspaceStrategy ?? 'checkout',
    };

    return success(data);
}
