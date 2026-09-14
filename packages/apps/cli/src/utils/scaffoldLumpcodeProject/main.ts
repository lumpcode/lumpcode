import type { Failure, Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

export type ScaffoldLumpcodeProjectInput = {
    projectRoot: string;
    project: { projectName: string; primaryBranch: string };
    local: {
        mode: Mode;
        workspaceStrategy?: WorkspaceStrategy;
        maxParallelRun?: number;
    };
};

/**
 * Create-only `.lumpcode/` write path. Stub until scaffold-lumpcode-project impl.
 */
export async function scaffoldLumpcodeProject(
    _input: ScaffoldLumpcodeProjectInput,
): Promise<Success<{ lumpcodeDir: string }> | Failure<string>> {
    throw new Error('not implemented');
}
