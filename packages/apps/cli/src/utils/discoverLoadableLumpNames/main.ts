import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { execAsync, shellSingleQuote } from '@lumpcode/core';

import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { lumpDirPath, lumpsDirPath } from '../lumpDirPath';

const CONFIG_FILE_NAMES = ['config.ts', 'config.js', 'config.json'] as const;

async function isLumpConfigTrackedOnHead(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    lumpName: string;
}): Promise<boolean> {
    const { projectRoot, localConfigFolderPath, lumpName } = input;
    const lumpDir = lumpDirPath({ localConfigFolderPath, lumpName });

    for (const fileName of CONFIG_FILE_NAMES) {
        const absPath = path.join(lumpDir, fileName);
        try {
            await fs.access(absPath);
        } catch {
            continue;
        }
        const relPath = path.relative(projectRoot, absPath);
        const result = await execAsync(`git ls-files --error-unmatch ${shellSingleQuote(relPath)}`, {
            cwd: projectRoot,
        });
        if (result.success) {
            return true;
        }
    }

    return false;
}

export async function discoverTrackedLumpNames(
    localConfigFolderPath: string,
): Promise<string[]> {
    const lumpsDir = lumpsDirPath({ localConfigFolderPath });
    const projectRoot = path.dirname(localConfigFolderPath);
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
        const tracked = await isLumpConfigTrackedOnHead({
            projectRoot,
            localConfigFolderPath,
            lumpName,
        });
        if (tracked) names.push(lumpName);
    }
    return names.sort();
}

export async function discoverLoadableLumpNames(
    localConfigFolderPath: string,
    options?: {
        /** When true, only lumps with a config file tracked at `HEAD` are returned. */
        trackedOnHeadOnly?: boolean;
    },
): Promise<string[]> {
    const lumpsDir = lumpsDirPath({ localConfigFolderPath });
    const projectRoot = path.dirname(localConfigFolderPath);
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
        if (options?.trackedOnHeadOnly) {
            const tracked = await isLumpConfigTrackedOnHead({
                projectRoot,
                localConfigFolderPath,
                lumpName,
            });
            if (!tracked) continue;
        }
        const cfg = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (cfg.success) names.push(lumpName);
    }
    return names.sort();
}
