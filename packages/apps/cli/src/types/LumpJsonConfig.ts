import type { LumpVariables, StepVariables } from "@lumpcode/core";
import { LumpJsConfig } from "./LumpJsConfig";
import { LumpJsonConfigStep } from "./LumpJsonConfigStep";

export type LumpJsonConfig<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    [K in keyof LumpJsConfig<V, SV>]: Exclude<LumpJsConfig<V, SV>[K], Function>;
} & {
    prompt?: LumpJsonConfigStep<V, SV>;
    steps?: (LumpJsonConfigStep<V, SV> | string)[];
}
