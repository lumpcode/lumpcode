import type { ResolvedProjectLocalConfig } from './ResolvedProjectLocalConfig';

/**
 * Shape of `.lumpcode/project.json` — Pick from resolved config.
 * `projectName` is required on the file schema; other keys optional.
 */
export type ProjectJsonConfig = Pick<
    ResolvedProjectLocalConfig,
    | 'projectName'
    | 'primaryBranch'
    | 'primaryBranches'
    | 'projectBaseBranch'
    | 'command'
    | 'maximumNumberOfConcurrentBranches'
    | 'keepHistory'
>;
