/**
 * Input for {@link validateLumpBaseBranchAllowlist}.
 */
export interface ValidateLumpBaseBranchAllowlistInput {
    lumpName: string;
    resolvedBaseBranch: string;
    effectiveBranches: string[];
    allowUnlistedBaseBranch?: boolean;
}
