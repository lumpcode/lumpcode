import type { PromptFn } from '@lumpcode/core';
import { identity } from './identity';

export const definePromptFn = identity<PromptFn>;
