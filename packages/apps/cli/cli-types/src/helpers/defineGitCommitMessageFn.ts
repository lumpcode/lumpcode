import type { GitCommitMessageFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGitCommitMessageFn = identity<GitCommitMessageFn>;
