import type { GetContextListFn, LumpVariables } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineGetContextListFn<V extends LumpVariables = LumpVariables>(
  fn: GetContextListFn<V>,
): GetContextListFn<V> {
  return fn;
}
