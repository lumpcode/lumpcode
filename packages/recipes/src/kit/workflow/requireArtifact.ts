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
    void input;
    throw new Error('not implemented');
}
