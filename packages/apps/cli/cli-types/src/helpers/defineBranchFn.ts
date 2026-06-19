import type { BranchFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineBranchFn = identity<BranchFn>;
