import * as z from 'zod';

import { success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { orCommandFailure } from '../../utils/commandFailure';
import { ensurePresetCommandsInstalled } from '../../utils/ensurePresetCommandsInstalled';

const inputSchema = z.object({
    options: baseCommandOptionsSchema,
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
};

export interface Injections {
    globalConfigFolderPath: string;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async () => {
    const result = await orCommandFailure(
        await ensurePresetCommandsInstalled({
            globalConfigFolderPath: injections.globalConfigFolderPath,
            overwrite: true,
        }),
    );

    if (!result.success) return result;

    return success({
        messages: ['Reinstalled shipped preset command modules into ~/.lumpcode/commands/presets/.'],
    });
};

export const command = {
    handlerMaker,
    name: 'reset-presets',
    description: 'Reinstall shipped preset command modules into ~/.lumpcode/commands/presets/.',
    inputSchema,
} satisfies Command;
