import type { LumpVariables, SetupFn } from '@lumpcode/core';

export function defineSetupFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<SetupFn<V>>,
): SetupFn<V> {
  return fn;
}
