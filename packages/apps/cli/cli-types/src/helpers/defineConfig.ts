import type { LumpVariables, StepVariables } from '@lumpcode/core';

import type { LumpJsConfig } from '../../../src/types/LumpJsConfig';

// testImpl stub: dual generics; step bag refinement lands with authoring types
export function defineConfig<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(config: LumpJsConfig<V, SV>): LumpJsConfig<V, SV> {
  return config;
}
