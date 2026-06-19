import type { GetContextListFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineGetContextListFn = identity<GetContextListFn>;
