import type { LumpVariables } from '@lumpcode/cli-types';

import { defineRecipe, type Recipe } from '../types/recipe';
import {
    ephemeralContextLump,
    type EphemeralContextLumpFixPromptInput,
    type EphemeralContextLumpOptions,
    type EphemeralContextLumpValidateCommand,
} from './ephemeralContextLump';

export type SoloTaskFixPromptInput = EphemeralContextLumpFixPromptInput;
export type SoloTaskValidateCommand = EphemeralContextLumpValidateCommand;

export type SoloTaskOptions<V extends LumpVariables = LumpVariables> = Omit<
    EphemeralContextLumpOptions<V>,
    'contextCount' | 'maxContextCount'
>;

/**
 * One ephemeral context per run with a verify-until-green loop.
 * Convenience wrapper around {@link ephemeralContextLump} with `contextCount: 1`.
 */
export const soloTask: Recipe<SoloTaskOptions> = defineRecipe((options) => {
    return ephemeralContextLump({
        ...options,
        contextCount: 1,
    });
});
