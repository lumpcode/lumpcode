import type { LumpVariables, TeardownFn } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineCommandTeardown<V extends LumpVariables = LumpVariables>(
  fn: TeardownFn<V>,
): TeardownFn<V> {
  return fn;
}
