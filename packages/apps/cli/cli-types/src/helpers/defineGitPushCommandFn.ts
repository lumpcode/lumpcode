import type { GitPushCommandFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGitPushCommandFn = identity<GitPushCommandFn>;
