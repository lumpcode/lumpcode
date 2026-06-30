import type { LumpVariables, MaybePromise, RunLumpInput } from "@lumpcode/core";

import { LumpJsConfigStep } from "./LumpJsConfigStep";
import type { ContextMatchFn } from "./ContextMatchFn";
import type { ContextOptionsFn } from "./ContextOptionsFn";
import { FilePath } from "./FilePath";
import { LumpJsConfigSteps } from "./LumpJsConfigSteps";
import { MergeObjs } from "./MergeObjs";

export type LumpJsConfig<V extends LumpVariables = LumpVariables> = MergeObjs<Omit<{
    [K in keyof RunLumpInput<V>]?: NonNullable<RunLumpInput<V>[K]> extends Function ? (RunLumpInput<V>[K] | FilePath) : RunLumpInput<V>[K];
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
    baseBranch?: RunLumpInput<V>['baseBranch'];
    /** Which integration line this lump is discovered and scheduled on (defaults to primary discovery branch). */
    discoveryBranch?: string;
    command?: LumpJsConfigStep['command'];
    contextListJson?: FilePath | Record<string, string>;
    contextMatchFn?: FilePath | ContextMatchFn;
    contextOptionsFn?: FilePath | ContextOptionsFn;
    disabled?: boolean | (() => MaybePromise<boolean>) | FilePath;
    maximumNumberOfConcurrentBranches?: number;
    prompt?: LumpJsConfigStep | LumpJsConfigStep['promptTemplate'] | LumpJsConfigStep['promptFn'];
    steps?: LumpJsConfigSteps;
    registerCommands?: string[];
    keepHistory?: boolean;
    verbose?: boolean;
}>;
