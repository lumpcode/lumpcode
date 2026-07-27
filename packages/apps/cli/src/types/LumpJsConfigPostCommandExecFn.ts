import type {
    LumpVariables,
    MaybePromise,
    PostCommandExecFn,
    StepVariables,
} from "@lumpcode/core";
import type { LumpJsConfigSteps, LumpJsConfigStepsItem } from "./LumpJsConfigSteps";

export type LumpJsConfigPostCommandExecFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (
    input: Parameters<PostCommandExecFn<V, SV>>[0],
) => MaybePromise<void | LumpJsConfigSteps<V, SV> | LumpJsConfigStepsItem<V, SV>>;
