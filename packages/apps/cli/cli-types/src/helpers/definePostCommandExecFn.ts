import type { LumpVariables, StepVariables } from '@lumpcode/core';
import type { LumpJsConfigPostCommandExecFn } from '../../../src/types/LumpJsConfigPostCommandExecFn';

export function definePostCommandExecFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: NoInfer<LumpJsConfigPostCommandExecFn<V, SV>>): LumpJsConfigPostCommandExecFn<V, SV> {
  return fn;
}
