import type { ResolvedProjectLocalConfig } from './ResolvedProjectLocalConfig';

/**
 * Shape of `.lumpcode/local.json` — Pick from resolved config.
 * `mode` is required on the file schema; other keys optional.
 */
export type LocalJsonConfig = Pick<
    ResolvedProjectLocalConfig,
    | 'mode'
    | 'workspaceStrategy'
    | 'disabled'
    | 'maxParallelRun'
    | 'primaryBranch'
    | 'primaryBranches'
    | 'projectBaseBranch'
    | 'command'
    | 'maximumNumberOfConcurrentBranches'
    | 'keepHistory'
    | 'verbose'
>;
