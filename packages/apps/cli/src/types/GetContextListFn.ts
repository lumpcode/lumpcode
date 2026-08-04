import type {
    CodeBasePath,
    GetContextListFnOutput,
    LumpVariables,
} from '@lumpcode/core';

/**
 * Author-facing CLI context list fn. Requires concrete `discoveryBranch`.
 * At the run boundary, CLI adapts this to core `GetContextListFn` (no discovery field).
 */
export type GetContextListFnInput<V extends LumpVariables = LumpVariables> = {
    codeBasePaths: CodeBasePath[];
    lumpVariables: V;
    discoveryBranch: string;
};

export type GetContextListFn<V extends LumpVariables = LumpVariables> = (
    params: GetContextListFnInput<V>,
) => GetContextListFnOutput;
