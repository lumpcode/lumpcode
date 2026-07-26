import type { LumpVariables, StepVariables } from "@lumpcode/core";
import { LumpJsConfig } from "./LumpJsConfig";
import { LumpJsonConfigStep } from "./LumpJsonConfigStep";

// testImpl stub: accept <V, SV>; step bag not threaded until implementation
export type LumpJsonConfig<
    V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = {
    [K in keyof LumpJsConfig<V>]: Exclude<LumpJsConfig<V>[K], Function>;
} & {
    prompt?: LumpJsonConfigStep;
    steps?: (LumpJsonConfigStep | string)[];
}
