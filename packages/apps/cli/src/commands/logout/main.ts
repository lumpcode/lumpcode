import * as fs from 'node:fs/promises';

import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { AUTH_FILE_PATH } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';

const inputSchema = z.object({
    options: baseCommandOptionsSchema,
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: { removed: boolean };
};

export interface Injections {
    authFilePath?: string;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (_input) => {
    const { authFilePath = AUTH_FILE_PATH } = injections || {};

    try {
        await fs.unlink(authFilePath);
        return success({
            messages: ['Logged out. Stored authentication was removed.'],
            data: { removed: true },
        });
    } catch (error: unknown) {
        const code =
            error && typeof error === 'object' && 'code' in error
                ? (error as NodeJS.ErrnoException).code
                : undefined;
        if (code === 'ENOENT') {
            return success({
                messages: ['No stored authentication found.'],
                data: { removed: false },
            });
        }
        return failure({
            messages: ['Failed to remove stored authentication.'],
            data: error,
        });
    }
};

export const command = {
    handlerMaker,
    name: 'logout',
    description: 'Log out and remove the stored authentication token',
    inputSchema,
    defaultInjections: {
        authFilePath: AUTH_FILE_PATH,
    },
} satisfies Command;
