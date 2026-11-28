import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';

import { defineRecipe } from '../../types';
import type { FeatureBacklogOptions } from './types';

export const featureBacklog = defineRecipe(function featureBacklog<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(_options: FeatureBacklogOptions<V, SV>): LumpJsConfig<V, SV> {
    throw new Error('featureBacklog workflow is not implemented.');
});
