import type { CommandFn, LumpVariables, StepVariables } from '@lumpcode/core';

// testImpl stub: dual generics; bags not threaded until core implementation
export function defineCommand<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: CommandFn<V, SV>): CommandFn<V, SV> {
  return fn;
}
