import { LumpVariables, StepVariables } from "@lumpcode/core";
import { LumpJsConfig } from "../../types";

export function defineConfig<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(config: NoInfer<LumpJsConfig<V, SV>>): LumpJsConfig<V, SV> {
    return config;
}
