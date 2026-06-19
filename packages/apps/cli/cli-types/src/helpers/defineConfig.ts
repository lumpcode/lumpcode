import type { LumpVariables } from '@lumpcode/core';

import type { LumpJsConfig } from '../../../src/types/LumpJsConfig';
import { identity } from './identity';

export const defineConfig: <V extends LumpVariables = LumpVariables>(
  config: LumpJsConfig<V>,
) => LumpJsConfig<V> = identity;
