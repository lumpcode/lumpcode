import type { LumpVariables, MaybePromise, RunLumpInput, StepVariables } from "@lumpcode/core";

import type { BaseBranchFn } from "./BaseBranchFn";
import { LumpJsConfigStep } from "./LumpJsConfigStep";
import type { ContextMatchFn } from "./ContextMatchFn";
import type { ContextOptionsFn } from "./ContextOptionsFn";
import { FilePath } from "./FilePath";
import type { GetContextListFn } from "./GetContextListFn";
import { LumpJsConfigSteps, LumpJsConfigStepsItem } from "./LumpJsConfigSteps";
import { MergeObjs } from "./MergeObjs";
import type { PostSetupWorkspaceFn } from "./PostSetupWorkspaceFn";
import type { PostTeardownWorkspaceFn } from "./PostTeardownWorkspaceFn";

type LumpJsConfigSoloStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> =
    | LumpJsConfigStep<V, SV>
    | LumpJsConfigStep<V, SV>['promptTemplate']
    | LumpJsConfigStep<V, SV>['promptFn'];

export type LumpJsConfig<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = MergeObjs<Omit<{
    [K in keyof RunLumpInput<V, SV>]?: NonNullable<RunLumpInput<V, SV>[K]> extends Function ? (RunLumpInput<V, SV>[K] | FilePath) : RunLumpInput<V, SV>[K];
}, 
    | 'gitCommitMessageFn' 
    | 'projectRoot' 
    | 'branchFn' 
    | 'baseBranch' 
    | 'setupWorkspaceFn' 
    | 'teardownWorkspaceFn'
    | 'gitAddCommitFn'
    | 'gitPushFn'
    | 'getContextListFn'
    | 'refreshRemoteTrackingRefsFn'
>, {
    /**
     * Execution integration branch. Exact string, `BaseBranchFn`, or FilePath to a module.
     * Omit → concrete effective discovery branch. Pattern strings are rejected at resolve.
     */
    baseBranch?: string | BaseBranchFn | FilePath;
    /** Which integration line this lump is discovered and scheduled on (defaults to primary). Exact or git-glob. */
    discoveryBranch?: string;
    /**
     * Discovery rules (exact and/or git-glob). Mutually exclusive with `discoveryBranch`.
     */
    discoveryBranches?: string[];
    command?: LumpJsConfigStep<V, SV>['command'];
    contextListJson?: FilePath | Record<string, string>;
    contextMatchFn?: FilePath | ContextMatchFn<V>;
    contextOptionsFn?: FilePath | ContextOptionsFn;
    /** Author context list fn (CLI shape with required `discoveryBranch`). */
    getContextListFn?: FilePath | GetContextListFn<V>;
    disabled?: boolean | (() => MaybePromise<boolean>) | FilePath;
    maximumNumberOfConcurrentBranches?: number;
    prompt?: LumpJsConfigSoloStep<V, SV>;
    steps?: LumpJsConfigSteps<V, SV> | LumpJsConfigStepsItem<V, SV>;
    registerCommands?: string[];
    keepHistory?: boolean;
    verbose?: boolean;
    /**
     * After generated checkout/worktree setup. Mutually exclusive with
     * `postSetupWorkspaceCommand`.
     */
    postSetupWorkspaceFn?: FilePath | PostSetupWorkspaceFn<V>;
    /** Shell fragment in the branch workspace. Mutually exclusive with `postSetupWorkspaceFn`. */
    postSetupWorkspaceCommand?: string;
    /**
     * Before generated workspace teardown. Mutually exclusive with
     * `postTeardownWorkspaceCommand`.
     */
    postTeardownWorkspaceFn?: FilePath | PostTeardownWorkspaceFn<V>;
    /** Shell fragment in the branch workspace. Mutually exclusive with `postTeardownWorkspaceFn`. */
    postTeardownWorkspaceCommand?: string;
}>;
