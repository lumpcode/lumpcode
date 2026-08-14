import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { lumpDirPath } from '../lumpDirPath';

/** Default runnable lump used across CLI tests and fixtures. */
export const MINIMAL_RUNNABLE_LUMP_CONFIG = {
    contextListJson: { NAME: 'README' },
    prompt: { promptTemplate: 'E2E @{NAME}', command: 'copilot' },
} as const;

export type MinimalRunnableLumpConfig = typeof MINIMAL_RUNNABLE_LUMP_CONFIG;

export async function writeLumpConfigJson(input: {
    /** Parent of `lumps/` (directory containing `.lumpcode/`), or `.lumpcode/` itself. */
    localConfigFolderPath: string;
    lumpName: string;
    /** Shallow-merged over `MINIMAL_RUNNABLE_LUMP_CONFIG` before write. */
    configOverrides?: Record<string, unknown>;
}): Promise<string> {
    const { localConfigFolderPath, lumpName, configOverrides } = input;
    const lumpDir = lumpDirPath({ localConfigFolderPath, lumpName });
    await fs.mkdir(lumpDir, { recursive: true });
    await fs.writeFile(
        path.join(lumpDir, 'config.json'),
        JSON.stringify({ ...MINIMAL_RUNNABLE_LUMP_CONFIG, ...configOverrides }),
        'utf-8',
    );
    return lumpDir;
}
