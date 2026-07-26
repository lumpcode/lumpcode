import path from 'node:path';

import type { LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import type { Step } from '@lumpcode/core';
import { pathExists } from '@lumpcode/core';

/** Fails the context when the artifact referenced by a context variable was not created. */
export function requireArtifactStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(artifactPathVarName: string): Step<V, SV> {
    return {
        async commandFn({ context, workspacePath }) {
            const artifactPath = context.variables[artifactPathVarName];
            if (typeof artifactPath !== 'string' || artifactPath.trim() === '') {
                throw new Error(`Missing context variable ${artifactPathVarName}`);
            }

            const fullPath = path.join(workspacePath, artifactPath);
            const exists = await pathExists(fullPath);
            if (!exists) {
                throw new Error(`Expected artifact at ${artifactPath} was not created`);
            }

            return {
                executable: 'node',
                args: ['-e', 'process.exit(0)'],
            };
        },
    };
}
