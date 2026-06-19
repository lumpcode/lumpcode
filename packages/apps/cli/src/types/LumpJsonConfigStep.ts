import type { Step } from "@lumpcode/core";
import { FilePathOrString } from "./FilePathOrString";
import { FilePath } from "./FilePath";
import { MergeObjs } from "./MergeObjs";

export type LumpJsonConfigStep = MergeObjs<Omit<Step, 'commandFn'>, {
    promptTemplate?: FilePathOrString;
    promptFn?: FilePath;
    command?: string | FilePath;
    postCommandExecFn?: FilePath;
}>;
