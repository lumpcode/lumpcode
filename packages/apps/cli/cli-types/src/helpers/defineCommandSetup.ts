import type { SetupFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineCommandSetup = identity<SetupFn>;
