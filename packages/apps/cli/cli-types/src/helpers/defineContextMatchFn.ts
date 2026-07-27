import type { LumpVariables } from '@lumpcode/core';

import type { ContextMatchFn } from '../../../src/types/ContextMatchFn';

export function defineContextMatchFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<ContextMatchFn<V>>,
): ContextMatchFn<V> {
  return fn;
}
