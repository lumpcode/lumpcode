export interface ProjectConfig {
    projectName?: string;
    maximumNumberOfConcurrentBranches?: number;
    /** Legacy default integration branch when lump config omits baseBranch and discoveryBranch. */
    projectBaseBranch?: string;
}
