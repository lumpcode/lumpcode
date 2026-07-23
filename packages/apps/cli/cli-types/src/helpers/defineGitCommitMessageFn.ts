import type { GitCommitMessageFn, LumpVariables } from '@lumpcode/core';

// testImpl stub: lump-only <V>
export function defineGitCommitMessageFn<V extends LumpVariables = LumpVariables>(
  fn: GitCommitMessageFn<V>,
): GitCommitMessageFn<V> {
  return fn;
}
