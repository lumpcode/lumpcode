import type { LumpVariables, SetupFn } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineCommandSetup<V extends LumpVariables = LumpVariables>(
  fn: SetupFn<V>,
): SetupFn<V> {
  return fn;
}
