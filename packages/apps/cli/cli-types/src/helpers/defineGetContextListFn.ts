import type { GetContextListFn, LumpVariables } from '@lumpcode/core';

export function defineGetContextListFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<GetContextListFn<V>>,
): GetContextListFn<V> {
  return fn;
}
