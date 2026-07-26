import type { LumpVariables, PromptFn, StepVariables } from '@lumpcode/core';

export function definePromptFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: NoInfer<PromptFn<V, SV>>): PromptFn<V, SV> {
  return fn;
}
