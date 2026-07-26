import type { LumpVariables, SetupFn } from '@lumpcode/core';

export function defineCommandSetup<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<SetupFn<V>>,
): SetupFn<V> {
  return fn;
}
