import type { LumpVariables } from '@lumpcode/core';

import type { GetContextListFn } from '../../../src/types/GetContextListFn';

export function defineGetContextListFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<GetContextListFn<V>>,
): GetContextListFn<V> {
  return fn;
}
