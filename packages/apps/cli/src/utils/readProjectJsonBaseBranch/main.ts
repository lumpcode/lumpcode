import * as fs from 'node:fs/promises';

import type { ProjectConfig } from '../../types/ProjectConfig';
import { projectJsonPath } from '../projectJsonPath';
import { readJson } from '../readJson';

export async function readProjectJsonBaseBranch(input: {
    localConfigFolderPath: string;
}): Promise<string | undefined> {
    const filePath = projectJsonPath({ localConfigFolderPath: input.localConfigFolderPath });
    try {
        await fs.access(filePath);
    } catch {
        return undefined;
    }

    const readResult = await readJson<ProjectConfig>(filePath);
    if (!readResult.success) {
        return undefined;
    }
    const branch = readResult.data.projectBaseBranch?.trim();
    return branch || undefined;
}
