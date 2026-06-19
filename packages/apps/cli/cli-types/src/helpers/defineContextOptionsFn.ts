import type { ContextOptionsFn } from '../../../src/types/ContextOptionsFn';
import { identity } from './identity';

export const defineContextOptionsFn = identity<ContextOptionsFn>;
