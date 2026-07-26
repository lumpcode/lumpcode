import type { GitCommitMessageFn, LumpVariables } from '@lumpcode/core';

export function defineGitCommitMessageFn<V extends LumpVariables = LumpVariables>(
  fn: NoInfer<GitCommitMessageFn<V>>,
): GitCommitMessageFn<V> {
  return fn;
}
