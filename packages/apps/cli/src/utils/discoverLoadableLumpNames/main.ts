import * as fs from 'node:fs/promises';
import type { Logger } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types/LumpJsConfig';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { lumpsDirPath } from '../lumpDirPath';

export async function discoverLumpNames(localConfigFolderPath: string): Promise<string[]> {
    const lumpsDir = lumpsDirPath({ localConfigFolderPath });
    let entries;
    try {
        entries = await fs.readdir(lumpsDir, { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .filter((ent) => ent.isDirectory())
        .map((ent) => ent.name)
        .sort();
}

export type LoadableLump = {
    lumpName: string;
    jsConfig: LumpJsConfig;
};

export async function discoverLoadableLumps(input: {
    localConfigFolderPath: string;
    logger?: Logger;
}): Promise<LoadableLump[]> {
    const { localConfigFolderPath, logger } = input;
    const loadable: LoadableLump[] = [];
    for (const lumpName of await discoverLumpNames(localConfigFolderPath)) {
        const cfg = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (!cfg.success) {
            logger?.warn(`lump "${lumpName}": ${cfg.data}; skipping`);
            continue;
        }
        loadable.push({ lumpName, jsConfig: cfg.data });
    }
    return loadable;
}

export async function discoverLoadableLumpNames(input: {
    localConfigFolderPath: string;
    logger?: Logger;
}): Promise<string[]> {
    const lumps = await discoverLoadableLumps(input);
    return lumps.map((lump) => lump.lumpName);
}
