import type { LumpVariables, TeardownFn } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineTeardownFn<V extends LumpVariables = LumpVariables>(
  fn: TeardownFn<V>,
): TeardownFn<V> {
  return fn;
}
