import type { LumpVariables } from '@lumpcode/core';

import type { ContextMatchFn } from '../../../src/types/ContextMatchFn';

// testImpl stub: lump-only <V>
export function defineContextMatchFn<V extends LumpVariables = LumpVariables>(
  fn: ContextMatchFn<V>,
): ContextMatchFn<V> {
  return fn;
}
