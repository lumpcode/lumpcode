import type { LumpJsConfigStep } from '../../../src/types/LumpJsConfigStep';
import { identity } from './identity';

export const defineStep = identity<LumpJsConfigStep>;
