import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { addCommand } from './main';

vi.mock('../cliLog', () => ({
    cliLog: vi.fn(),
}));

import { cliLog } from '../cliLog';

const inputSchema = z.object({
    options: z.object({
        json: z.boolean().optional().describe('Output as JSON'),
        verbose: z.boolean().optional().describe('Enable verbose operational logging'),
        limit: z.number().optional().describe('Maximum count'),
    }),
    arguments: z.object({
        target: z.string().min(3).describe('Target name'),
    }),
});

async function addDemoCommandAndRunIt(
    argv: string[],
    handler = vi.fn().mockResolvedValue(
        success({ messages: ['done'], data: { ok: true } }),
    ),
    deps?: { exit?: (code: number) => never },
) {
    const program = new Command();
    program.exitOverride();
    await addCommand(inputSchema, handler, 'demo', 'Demo command', deps)(program);
    await program.parseAsync(['demo', ...argv], { from: 'user' });
    return handler;
}

describe('addCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers a subcommand with the given name and description', async () => {
        const program = new Command();
        const sub = await addCommand(
            inputSchema,
            vi.fn(),
            'demo',
            'Demo command',
        )(program);

        expect(sub.name()).toBe('demo');
        expect(sub.description()).toBe('Demo command');
    });

    it('passes parsed positional arguments and options to the handler', async () => {
        const handler = await addDemoCommandAndRunIt(['alpha', '--limit', '7']);

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith({
            options: { limit: 7 },
            arguments: { target: 'alpha' },
        });
    });

    it('treats --json as a boolean flag without a value', async () => {
        const handler = await addDemoCommandAndRunIt(['alpha', '--json']);

        expect(handler).toHaveBeenCalledWith({
            options: { json: true },
            arguments: { target: 'alpha' },
        });
    });

    it('logs handler output through cliLog', async () => {
        await addDemoCommandAndRunIt(['alpha', '--json']);

        expect(cliLog).toHaveBeenCalledWith(
            { messages: ['done'], data: { ok: true } },
            true,
            false,
        );
    });

    it('exits with code 1 when the handler returns Failure', async () => {
        const exit = vi.fn((code: number) => {
            throw new Error(`exit:${code}`);
        }) as (code: number) => never;
        const handler = vi.fn().mockResolvedValue(
            failure({ messages: ['something went wrong'] }),
        );

        await expect(
            addDemoCommandAndRunIt(['alpha'], handler, { exit }),
        ).rejects.toThrow('exit:1');

        expect(cliLog).toHaveBeenCalledWith(
            { messages: ['something went wrong'] },
            false,
            true,
        );
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('exits when Zod rejects input that Commander already accepted', async () => {
        const exit = vi.fn((code: number) => {
            throw new Error(`exit:${code}`);
        }) as (code: number) => never;

        await expect(
            addDemoCommandAndRunIt(['ab'], undefined, { exit }),
        ).rejects.toThrow('exit:1');

        expect(exit).toHaveBeenCalledWith(1);
        expect(cliLog).toHaveBeenCalledWith(
            expect.objectContaining({ messages: expect.arrayContaining([expect.stringContaining('Invalid input:')]) }),
            false,
            true,
        );
    });

    it('emits a JSON envelope for validation failures when --json is set', async () => {
        const exit = vi.fn((code: number) => {
            throw new Error(`exit:${code}`);
        }) as (code: number) => never;

        await expect(
            addDemoCommandAndRunIt(['ab', '--json'], undefined, { exit }),
        ).rejects.toThrow('exit:1');

        expect(cliLog).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [expect.stringMatching(/^Invalid input:/)],
            }),
            true,
            true,
        );
    });
});
