import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Step } from '@lumpcode/core';

import type { LumpJsConfigStep } from '../../../types';
import {
    assertFailure,
    assertSuccess,
    commandFnCallArgs,
    promptFnInput,
    resolveWithFixtures,
    stubCommandFn,
} from './testHelpers';

describe('jsConfigToRunLumpInput promptTemplate and command file references', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads promptTemplate from a lump-relative template file', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            command: stubCommandFn,
            prompt: { promptTemplate: './prompts/from-file.md', commandFn: stubCommandFn },
        }));
        const item = data.steps[0] as Step;
        expect(await item.promptFn?.(promptFnInput({ FILE: 'app.ts' }))).toBe(
            'Refactor @app.ts using the on-disk template.',
        );
    });

    it('treats prompt text with spaces as inline even when it mentions a .md path', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            command: stubCommandFn,
            prompt: {
                promptTemplate: 'Add a section to prompts/readme.md',
                commandFn: stubCommandFn,
            },
        }));
        const item = data.steps[0] as Step;
        expect(await item.promptFn?.(promptFnInput())).toBe('Add a section to prompts/readme.md');
    });

    it('fails fast when a prompt template file is missing', async () => {
        assertFailure(
            await resolveWithFixtures({
                command: stubCommandFn,
                prompt: { promptTemplate: './prompts/missing.md', commandFn: stubCommandFn },
            }),
            'Prompt template file not found: ./prompts/missing.md',
        );
    });

    it('loads command modules from a lump-relative .js file path', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            command: './agents/file-agent.js',
            prompt: 'Hi',
        }));
        const item = data.steps[0] as Step;
        expect(item.commandFn?.commandName).toBe('./agents/file-agent.js');
        expect(await item.commandFn?.(commandFnCallArgs)).toEqual({
            executable: 'file-agent',
            args: ['--from-file'],
        });
    });

    it('fails fast when a command module file is missing', async () => {
        assertFailure(
            await resolveWithFixtures({
                command: './agents/missing.js',
                prompt: 'Hi',
            }),
            'Command module file not found: ./agents/missing.js',
        );
    });

    it('loads file-path commands inside recursive steps without registerCommands', async () => {
        const recursiveFn = async () => [{
            promptTemplate: 'Do work',
            command: './agents/file-agent.js',
        } as LumpJsConfigStep];
        const data = assertSuccess(await resolveWithFixtures({
            command: stubCommandFn,
            prompt: undefined,
            steps: [recursiveFn],
        }));
        const subItems = await (data.steps[0] as Function)(promptFnInput()) as Step[];
        expect(subItems).toHaveLength(1);
        expect(subItems[0].commandFn?.commandName).toBe('./agents/file-agent.js');
    });

    it('loads template files from string shorthand in steps', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            command: stubCommandFn,
            prompt: undefined,
            steps: ['./prompts/from-file.md'],
        }));
        const item = data.steps[0] as Step;
        expect(await item.promptFn?.(promptFnInput({ FILE: 'lib.ts' }))).toBe(
            'Refactor @lib.ts using the on-disk template.',
        );
    });
});
