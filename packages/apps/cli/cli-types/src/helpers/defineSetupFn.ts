import type { LumpVariables, SetupFn } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineSetupFn<V extends LumpVariables = LumpVariables>(
  fn: SetupFn<V>,
): SetupFn<V> {
  return fn;
}
