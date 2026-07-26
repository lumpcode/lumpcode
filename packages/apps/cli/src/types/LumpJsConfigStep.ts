import type { LumpVariables, PostCommandExecFn, PromptFn, Step, StepVariables } from "@lumpcode/core";
import { FilePathOrString } from "./FilePathOrString";
import { FilePath } from "./FilePath";
import { MergeObjs } from "./MergeObjs";
import { CommandTag } from "./CommandTag";

// testImpl stub: accept <V, SV>; stepVariables not refined until implementation
export type LumpJsConfigStep<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = MergeObjs<Step, {
    promptTemplate?: FilePathOrString;
    promptFn?: FilePath | PromptFn;
    postCommandExecFn?: FilePath | PostCommandExecFn;
    command?: CommandTag | FilePath | Step['commandFn'];
}>;
