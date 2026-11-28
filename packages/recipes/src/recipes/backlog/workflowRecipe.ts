import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';

import { defineRecipe, type BaseBacklogItem } from '../../types';
import type { BacklogOptions, BacklogStageDefinition } from './types';

export const backlog = defineRecipe(function backlog<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
    Stages extends Record<string, BacklogStageDefinition<V, SV>> = Record<
        string,
        BacklogStageDefinition<V, SV>
    >,
>(_options: BacklogOptions<Item, V, SV, Stages>): LumpJsConfig<V, SV> {
    throw new Error('backlog workflow is not implemented.');
});
