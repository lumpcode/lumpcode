import type { LumpVariables, MaybePromise, RunLumpInput, StepVariables } from "@lumpcode/core";

import { LumpJsConfigStep } from "./LumpJsConfigStep";
import type { ContextMatchFn } from "./ContextMatchFn";
import type { ContextOptionsFn } from "./ContextOptionsFn";
import { FilePath } from "./FilePath";
import { LumpJsConfigSteps, LumpJsConfigStepsItem } from "./LumpJsConfigSteps";
import { MergeObjs } from "./MergeObjs";

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
    | 'gitAddCommandFn' 
    | 'gitCommitCommandFn' 
    | 'gitPushCommandFn'
>, {
    baseBranch?: RunLumpInput<V, SV>['baseBranch'];
    /** Which integration line this lump is discovered and scheduled on (defaults to primary branch from local.json). */
    discoveryBranch?: string;
    command?: LumpJsConfigStep<V, SV>['command'];
    contextListJson?: FilePath | Record<string, string>;
    contextMatchFn?: FilePath | ContextMatchFn<V>;
    contextOptionsFn?: FilePath | ContextOptionsFn;
    disabled?: boolean | (() => MaybePromise<boolean>) | FilePath;
    maximumNumberOfConcurrentBranches?: number;
    prompt?: LumpJsConfigSoloStep<V, SV>;
    steps?: LumpJsConfigSteps<V, SV> | LumpJsConfigStepsItem<V, SV>;
    registerCommands?: string[];
    keepHistory?: boolean;
    verbose?: boolean;
}>;
