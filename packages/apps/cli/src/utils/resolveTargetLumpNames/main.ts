import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { discoverLoadableLumpNames } from '../discoverLoadableLumpNames';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';

export async function resolveTargetLumpNames(input: {
    localConfigFolderPath: string;
    lumpName?: string;
}): Promise<Success<string[]> | Failure<string>> {
    const { localConfigFolderPath, lumpName } = input;
    if (lumpName) {
        const cfg = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (!cfg.success) {
            return failure(
                `No lump named "${lumpName}" with a loadable config (config.json or config.js).`,
            );
        }
        return success([lumpName]);
    }
    const lumpNames = await discoverLoadableLumpNames({ localConfigFolderPath });
    if (lumpNames.length === 0) {
        return failure(
            'No lumps with a loadable config (config.json or config.js) were found under .lumpcode/lumps.',
        );
    }
    return success(lumpNames);
}
