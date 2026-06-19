import * as fs from 'node:fs/promises';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { lumpsDirPath } from '../lumpDirPath';

export async function discoverLoadableLumpNames(localConfigFolderPath: string): Promise<string[]> {
    const lumpsDir = lumpsDirPath({ localConfigFolderPath });
    let entries;
    try {
        entries = await fs.readdir(lumpsDir, { withFileTypes: true });
    } catch {
        return [];
    }
    const names: string[] = [];
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const lumpName = ent.name;
        const cfg = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (cfg.success) names.push(lumpName);
    }
    return names.sort();
}

// TODO : add option to error if one found lump is not valid, default true