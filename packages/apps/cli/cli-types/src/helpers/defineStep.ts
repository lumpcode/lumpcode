import type { LumpVariables, StepVariables } from '@lumpcode/core';

import type { LumpJsConfigStep } from '../../../src/types/LumpJsConfigStep';

export function defineStep<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(step: NoInfer<LumpJsConfigStep<V, SV>>): LumpJsConfigStep<V, SV> {
  return step;
}
