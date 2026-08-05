export interface ProjectConfig {
    projectName?: string;
    primaryBranch?: string;
    primaryBranches?: string[];
    /** @deprecated Use `primaryBranch` instead. */
    projectBaseBranch?: string;
    command?: string;
    maximumNumberOfConcurrentBranches?: number;
    keepHistory?: boolean;
}
