import type { BranchFn, LumpVariables } from '@lumpcode/core';

export function defineBranchFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<BranchFn<V>>,
): BranchFn<V> {
  return fn;
}
