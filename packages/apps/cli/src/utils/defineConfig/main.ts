import { LumpVariables } from "@lumpcode/core";
import { LumpJsConfig } from "../../types";

export function defineConfig<V extends LumpVariables = LumpVariables>(config: LumpJsConfig<V>) {
    return config;
}
