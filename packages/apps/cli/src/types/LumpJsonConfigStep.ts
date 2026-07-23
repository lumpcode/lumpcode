import type { LumpVariables, Step, StepVariables } from "@lumpcode/core";
import { FilePathOrString } from "./FilePathOrString";
import { FilePath } from "./FilePath";
import { MergeObjs } from "./MergeObjs";

// testImpl stub: accept <V, SV>; stepVariables not refined until implementation
export type LumpJsonConfigStep<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = MergeObjs<Omit<Step, 'commandFn'>, {
    promptTemplate?: FilePathOrString;
    promptFn?: FilePath;
    command?: string | FilePath;
    postCommandExecFn?: FilePath;
}>;
