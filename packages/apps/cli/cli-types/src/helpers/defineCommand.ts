import type { CommandFn, LumpVariables, StepVariables } from '@lumpcode/core';

export function defineCommand<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: NoInfer<CommandFn<V, SV>>): CommandFn<V, SV> {
  return fn;
}
