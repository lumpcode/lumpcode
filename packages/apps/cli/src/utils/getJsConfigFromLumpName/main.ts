import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { decision, failure, Failure, success, Success } from "@lumpcode/core";
import { readJson } from '../readJson';
import { resolveImportable } from '../resolveImportable';
import { LumpJsConfig, LumpJsonConfig } from '../../types';
import { jsonConfigToJsConfig } from '../jsonConfigToJsConfig';
import { lumpDirPath } from '../lumpDirPath';
import { validateLumpJsonConfig } from '../validateLumpJsonConfig';

export async function getJsConfigFromLumpName(input: {
    lumpName: string;
    localConfigFolderPath: string;
}): Promise<Success<LumpJsConfig> | Failure<string>> {
    const { lumpName, localConfigFolderPath } = input;
    const lumpDir = lumpDirPath({ localConfigFolderPath, lumpName });
    const lumpConfigJsonPath = path.join(lumpDir, 'config.json');
    const lumpConfigJsPath = path.join(lumpDir, 'config.js');

    const [jsonConfigExists, jsConfigExists] = await Promise.all(
        [lumpConfigJsonPath, lumpConfigJsPath].map((p) =>
            fs.access(p).then(() => true).catch(() => false),
        ),
    );

    if (!jsonConfigExists && !jsConfigExists) {
        return failure(`Lump config not found for ${lumpName}`);
    }

    const jsConfigResolution = await decision([
        [
            () => jsConfigExists,
            async () => {
                const jsConfigResult = await resolveImportable<LumpJsConfig>(lumpConfigJsPath, 'default');
                if (!jsConfigResult.success) return jsConfigResult
                return success(jsConfigResult.data);
            }
        ],
        [ 
            () => jsonConfigExists,
            async () => {
                const jsonConfigResult = await readJson<LumpJsonConfig>(lumpConfigJsonPath);
                if (!jsonConfigResult.success) return failure(jsonConfigResult.data.message);
                const jsonConfigData = jsonConfigResult.data;
                const schemaResult = validateLumpJsonConfig(jsonConfigData);
                if (!schemaResult.success) return schemaResult;
                return success(jsonConfigToJsConfig(jsonConfigData));
            }
        ]
    ]);

    if (!jsConfigResolution.success) return jsConfigResolution;

    const jsConfig = jsConfigResolution.data;

    return success(jsConfig);
}