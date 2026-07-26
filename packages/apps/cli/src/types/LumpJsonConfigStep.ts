import type { LumpVariables, Step, StepVariables } from "@lumpcode/core";
import { FilePathOrString } from "./FilePathOrString";
import { FilePath } from "./FilePath";
import { MergeObjs } from "./MergeObjs";

export type LumpJsonConfigStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = MergeObjs<Omit<Step<V, SV>, 'commandFn'>, {
    promptTemplate?: FilePathOrString;
    promptFn?: FilePath;
    command?: string | FilePath;
    postCommandExecFn?: FilePath;
}>;
