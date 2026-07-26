import type { LumpVariables, PostCommandExecFn, StepVariables } from '@lumpcode/core';

// testImpl stub: dual generics; bags not threaded until core implementation
export function definePostCommandExecFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: PostCommandExecFn<V, SV>): PostCommandExecFn<V, SV> {
  return fn;
}
