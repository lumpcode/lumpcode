import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        projectPath: z.string().optional().describe('Path to the project root directory'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: { projectRoot: string; lumpName?: string; branchName?: string };
};

export type SetupPrompter = {
    confirm(input: { message: string; defaultValue: boolean }): Promise<boolean>;
    select(input: { message: string; choices: { value: string; label: string }[] }): Promise<string>;
    input(input: { message: string; defaultValue?: string }): Promise<string>;
    pause(input: { message: string }): Promise<void>;
};

export interface Injections {
    isInteractive?: () => boolean;
    prompter?: SetupPrompter;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (_injections) => async (_input) => {
    throw new Error('not implemented');
};

export const command = {
    handlerMaker,
    name: 'setup',
    description: 'Interactive first-run drive: scaffold, first lump, plan, and run',
    inputSchema,
} satisfies Command;
