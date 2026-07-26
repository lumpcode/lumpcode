import type { LumpVariables, StepVariables } from '@lumpcode/core';

import type { CommandModule } from '../../../src/types/CommandModule';

// testImpl stub: dual generics; must not erase — bags refined when CommandModule threads V/SV
export function defineCommandModule<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(module: CommandModule<V, SV>): CommandModule<V, SV> {
  return module;
}
