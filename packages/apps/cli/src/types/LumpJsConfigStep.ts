import type { PostCommandExecFn, PromptFn, Step } from "@lumpcode/core";
import { FilePathOrString } from "./FilePathOrString";
import { FilePath } from "./FilePath";
import { MergeObjs } from "./MergeObjs";
import { CommandTag } from "./CommandTag";

export type LumpJsConfigStep = MergeObjs<Step, {
    promptTemplate?: FilePathOrString;
    promptFn?: FilePath | PromptFn;
    postCommandExecFn?: FilePath | PostCommandExecFn;
    command?: CommandTag | FilePath | Step['commandFn'];
}>;
