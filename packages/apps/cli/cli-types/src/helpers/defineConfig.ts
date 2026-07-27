import type { LumpVariables, StepVariables } from '@lumpcode/core';

import type { LumpJsConfig } from '../../../src/types/LumpJsConfig';

export function defineConfig<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(config: NoInfer<LumpJsConfig<V, SV>>): LumpJsConfig<V, SV> {
  return config;
}
