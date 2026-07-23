import type { LumpVariables, PromptFn, StepVariables } from '@lumpcode/core';

// testImpl stub: dual generics; bags not threaded until core implementation
export function definePromptFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(fn: PromptFn<V, SV>): PromptFn<V, SV> {
  return fn;
}
