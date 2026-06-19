import type { ContextMatchFn } from '../../../src/types/ContextMatchFn';
import { identity } from './identity';

export const defineContextMatchFn = identity<ContextMatchFn>;
