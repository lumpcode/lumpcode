import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        projectPath: z.string().optional().describe('Path to a directory inside the git work tree'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        projectRoot: string;
        lumpName?: string;
        branchName?: string;
        startedDaemon?: boolean;
    };
};

export type SetupPrompter = {
    confirm(input: { message: string; defaultValue: boolean }): Promise<boolean>;
    select(input: { message: string; choices: { value: string; label: string }[] }): Promise<string>;
    input(input: { message: string; defaultValue?: string }): Promise<string>;
    pause(input: { message: string }): Promise<void>;
};

export type Injections = {
    isInteractive?: boolean;
    prompter?: SetupPrompter;
};

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = () => async () => {
    throw new Error('not implemented');
};

export const command = {
    handlerMaker,
    name: 'setup',
    description: 'Interactive first-lump drive: project config, a first lump, then plan and run',
    inputSchema,
} satisfies Command;
