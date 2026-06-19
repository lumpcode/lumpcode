import type { PostCommandExecFn } from '@lumpcode/core';
import { identity } from './identity';

export const definePostCommandExecFn = identity<PostCommandExecFn>;
