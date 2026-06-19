import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';

import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';

const localConfigSchema = z.object({
    mode: z.enum(['shared', 'dedicated']),
    projectBaseBranch: z.string().min(1, 'projectBaseBranch must be a non-empty string'),
    workspaceStrategy: z.enum(['checkout', 'worktree']).optional(),
    disabled: z.boolean().optional(),
});

const MISSING_HINT =
    'Missing .lumpcode/local.json. Run `lumpcode project-setup` to scaffold it, or create it with { "mode": "shared" | "dedicated", "projectBaseBranch": "main" }.';

export const LOCAL_CONFIG_FILE_NAME = 'local.json';

export async function readLocalConfig(input: {
    localConfigFolderPath: string;
}): Promise<Success<LocalConfig> | Failure<string>> {
    const filePath = path.join(input.localConfigFolderPath, LOCAL_CONFIG_FILE_NAME);

    let raw: string;
    try {
        raw = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
        const code =
            error && typeof error === 'object' && 'code' in error
                ? (error as NodeJS.ErrnoException).code
                : undefined;
        if (code === 'ENOENT') {
            return failure(MISSING_HINT);
        }
        return failure(`Cannot read ${filePath}: ${String(error)}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return failure(`Invalid JSON in ${filePath}: ${String(error)}`);
    }

    const validated = localConfigSchema.safeParse(parsed);
    if (!validated.success) {
        const messages = validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        return failure(`Invalid .lumpcode/local.json: ${messages}`);
    }

    const data: LocalConfig = {
        ...validated.data,
        workspaceStrategy: validated.data.workspaceStrategy ?? 'checkout',
    };

    return success(data);
}
