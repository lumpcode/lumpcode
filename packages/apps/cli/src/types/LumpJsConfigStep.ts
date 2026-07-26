import type { LumpVariables, PostCommandExecFn, PromptFn, Step, StepVariables } from "@lumpcode/core";
import { FilePathOrString } from "./FilePathOrString";
import { FilePath } from "./FilePath";
import { MergeObjs } from "./MergeObjs";
import { CommandTag } from "./CommandTag";

export type LumpJsConfigStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = MergeObjs<Step<V, SV>, {
    promptTemplate?: FilePathOrString;
    promptFn?: FilePath | PromptFn<V, SV>;
    postCommandExecFn?: FilePath | PostCommandExecFn<V, SV>;
    command?: CommandTag | FilePath | Step<V, SV>['commandFn'];
}>;
