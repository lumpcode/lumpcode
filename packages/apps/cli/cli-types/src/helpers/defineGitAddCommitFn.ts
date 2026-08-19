import type { GitAddCommitFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGitAddCommitFn = identity<GitAddCommitFn>;
