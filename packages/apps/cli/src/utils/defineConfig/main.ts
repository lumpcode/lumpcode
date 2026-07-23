import { LumpVariables, StepVariables } from "@lumpcode/core";
import { LumpJsConfig } from "../../types";

// testImpl stub: accept <V, SV>; step bag not threaded until authoring types + helpers land fully
export function defineConfig<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(config: LumpJsConfig<V, SV>): LumpJsConfig<V, SV> {
    return config;
}
