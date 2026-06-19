import type { LumpVariables } from "@lumpcode/core";
import { LumpJsConfig } from "./LumpJsConfig";
import { LumpJsonConfigStep } from "./LumpJsonConfigStep";

export type LumpJsonConfig<V extends LumpVariables = LumpVariables> = {
    [K in keyof LumpJsConfig<V>]: Exclude<LumpJsConfig<V>[K], Function>;
} & {
    prompt?: LumpJsonConfigStep;
    steps?: (LumpJsonConfigStep | string)[];
}
