import type { Mode } from './Mode';
import type { WorkspaceStrategy } from './WorkspaceStrategy';

/**
 * Resolved project+local machine surface after merge (local wins on shared keys)
 * and `workspaceStrategy` default. Canonical value type — implementation will
 * replace this stub with `z.infer<typeof resolvedProjectLocalConfigSchema>`.
 *
 * Stub for clean-local-project-json-config (testImpl); not yet wired to Zod.
 */
export interface ResolvedProjectLocalConfig {
    projectName: string;
    mode: Mode;
    workspaceStrategy: WorkspaceStrategy;
    disabled?: boolean;
    maxParallelRun?: number;
    primaryBranch?: string;
    primaryBranches?: string[];
    /** @deprecated Use `primaryBranch` instead. */
    projectBaseBranch?: string;
    command?: string;
    maximumNumberOfConcurrentBranches?: number;
    keepHistory?: boolean;
    verbose?: boolean;
}
