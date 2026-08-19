import type { GitPushFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGitPushFn = identity<GitPushFn>;
