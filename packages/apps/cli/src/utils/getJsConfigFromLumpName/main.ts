import * as path from 'node:path';

import { failure, Failure, pathExists, success, Success } from "@lumpcode/core";
import { decision } from '../decision';
import { readJsonFile } from '../readJsonFile';
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
    const lumpConfigTsPath = path.join(lumpDir, 'config.ts');

    const [jsonConfigExists, jsConfigExists, tsConfigExists] = await Promise.all(
        [lumpConfigJsonPath, lumpConfigJsPath, lumpConfigTsPath].map(pathExists),
    );

    if (!jsonConfigExists && !jsConfigExists && !tsConfigExists) {
        return failure(`Lump config not found for ${lumpName}`);
    }

    const jsConfigResolution = await decision([
        [
            () => tsConfigExists,
            async () => {
                const tsConfigResult = await resolveImportable<LumpJsConfig>(lumpConfigTsPath, 'default');
                if (!tsConfigResult.success) return tsConfigResult;
                return success(tsConfigResult.data);
            },
        ],
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
                const jsonConfigResult = await readJsonFile<LumpJsonConfig>({ filePath: lumpConfigJsonPath });
                if (!jsonConfigResult.success) return jsonConfigResult;
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
