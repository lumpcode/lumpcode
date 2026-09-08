import type { Failure, Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

export type ScaffoldLumpcodeProjectInput = {
    projectRoot: string;
    projectConfig: {
        projectName: string;
        primaryBranch: string;
    };
    localConfig: {
        mode: Mode;
        workspaceStrategy?: WorkspaceStrategy;
        maxParallelRun?: number;
    };
};

export type ScaffoldLumpcodeProjectOutput = {
    projectRoot: string;
    projectName: string;
    lumpcodeDir: string;
};

/** Create-only `.lumpcode/` scaffold. Fail if `.lumpcode/` already exists. */
export async function scaffoldLumpcodeProject(
    _input: ScaffoldLumpcodeProjectInput,
): Promise<Success<ScaffoldLumpcodeProjectOutput> | Failure<string>> {
    throw new Error('not implemented');
}
