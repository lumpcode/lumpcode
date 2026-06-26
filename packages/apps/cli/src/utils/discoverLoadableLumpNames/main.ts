import * as fs from 'node:fs/promises';
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

export async function discoverLoadableLumpNames(localConfigFolderPath: string): Promise<string[]> {
    const names: string[] = [];
    for (const lumpName of await discoverLumpNames(localConfigFolderPath)) {
        const cfg = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (cfg.success) names.push(lumpName);
    }
    return names;
}

// TODO : add option to error if one found lump is not valid, default true