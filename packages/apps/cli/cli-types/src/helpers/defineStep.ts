import type { LumpVariables, StepVariables } from '@lumpcode/core';

import type { LumpJsConfigStep } from '../../../src/types/LumpJsConfigStep';

// testImpl stub: dual generics; stepVariables not refined until implementation
export function defineStep<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(step: LumpJsConfigStep<V, SV>): LumpJsConfigStep<V, SV> {
  return step;
}
