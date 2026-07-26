import type { BranchFn, LumpVariables } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineBranchFn<V extends LumpVariables = LumpVariables>(
  fn: BranchFn<V>,
): BranchFn<V> {
  return fn;
}
