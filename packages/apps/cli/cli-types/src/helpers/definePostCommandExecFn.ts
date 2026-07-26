import type { LumpVariables, PostCommandExecFn, StepVariables } from '@lumpcode/core';

export function definePostCommandExecFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: NoInfer<PostCommandExecFn<V, SV>>): PostCommandExecFn<V, SV> {
  return fn;
}
