import type { LumpVariables, TeardownFn } from '@lumpcode/core';

export function defineCommandTeardown<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<TeardownFn<V>>,
): TeardownFn<V> {
  return fn;
}
