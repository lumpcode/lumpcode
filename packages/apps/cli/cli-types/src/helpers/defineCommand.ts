import type { CommandFn } from '@lumpcode/core';
import { identity } from './identity';

export const defineCommand = identity<CommandFn>;
