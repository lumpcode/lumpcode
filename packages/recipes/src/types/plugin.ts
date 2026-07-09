import type { LumpJsConfig, LumpVariables } from '@lumpcode/cli-types';

export type Plugin<O = void, V extends LumpVariables = LumpVariables> = (
    config: LumpJsConfig<V>,
    options?: O,
) => LumpJsConfig<V>;
