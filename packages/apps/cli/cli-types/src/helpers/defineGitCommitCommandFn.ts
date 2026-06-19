import type { GitCommitCommandFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGitCommitCommandFn = identity<GitCommitCommandFn>;
