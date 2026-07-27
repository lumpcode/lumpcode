import type { LumpVariables, StepVariables } from '@lumpcode/core';

import type { CommandModule } from '../../../src/types/CommandModule';

export function defineCommandModule<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(module: NoInfer<CommandModule<V, SV>>): CommandModule<V, SV> {
  return module;
}
