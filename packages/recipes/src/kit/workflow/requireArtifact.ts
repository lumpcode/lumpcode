import { access } from 'node:fs/promises';
import path from 'node:path';

import type { AgentSession } from '@lumpcode/core';

export interface RequireArtifactInput {
    session: AgentSession;
    workspacePath: string;
    /** Relative to `workspacePath`. */
    path: string;
    /** Default: `Write <path>. It is missing.` */
    prompt?: string;
    /** Default 2. */
    maxAttempts?: number;
}

/** Prompt until `path.join(workspacePath, path)` exists, or the attempt cap is hit. */
export async function requireArtifact(
    input: RequireArtifactInput,
): Promise<{ succeeded: boolean; path: string }> {
    const {
        session,
        workspacePath,
        path: relativePath,
        prompt,
        maxAttempts = 2,
    } = input;
    const text = prompt ?? `Write ${relativePath}. It is missing.`;

    if (await artifactExists(workspacePath, relativePath)) {
        return { succeeded: true, path: relativePath };
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await session.prompt(text);
        if (await artifactExists(workspacePath, relativePath)) {
            return { succeeded: true, path: relativePath };
        }
    }

    return { succeeded: false, path: relativePath };
}

async function artifactExists(workspacePath: string, relativePath: string): Promise<boolean> {
    try {
        await access(path.join(workspacePath, relativePath));
        return true;
    } catch {
        return false;
    }
}
