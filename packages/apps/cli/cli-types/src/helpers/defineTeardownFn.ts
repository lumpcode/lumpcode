import type { LumpVariables, TeardownFn } from '@lumpcode/core';

export function defineTeardownFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<TeardownFn<V>>,
): TeardownFn<V> {
  return fn;
}
