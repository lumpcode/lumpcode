import type { SetupFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineSetupFn = identity<SetupFn>;
