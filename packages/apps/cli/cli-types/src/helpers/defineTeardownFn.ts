import type { TeardownFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineTeardownFn = identity<TeardownFn>;
