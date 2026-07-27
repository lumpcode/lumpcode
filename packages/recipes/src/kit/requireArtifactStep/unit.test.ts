import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pathExists } from '@lumpcode/core';

import { requireArtifactStep } from './main';

describe('requireArtifactStep', () => {
    let workspacePath: string;
    let projectRoot: string;

    beforeEach(async () => {
        workspacePath = await mkdtemp(path.join(tmpdir(), 'artifact-step-'));
        projectRoot = workspacePath;
    });

    afterEach(async () => {
        await rm(workspacePath, { recursive: true, force: true });
    });

    it('returns a failing command when the artifact file was not created', async () => {
        const validationCommandFn = requireArtifactStep('REQ_FILE');
        const descriptor = await validationCommandFn({
            context: {
                name: 'ctx',
                variables: { REQ_FILE: 'missing/requirements.md' },
            },
            workspacePath,
            projectRoot,
            prompt: '',
            lumpVariables: {},
            stepIndex: 0,
            contextRunState: {},
            currentIteration: 0,
            prevValidateCommandResult: null,
        });

        expect(descriptor).toMatchObject({
            executable: 'node',
            args: [
                '-e',
                expect.stringContaining('Expected artifact at missing/requirements.md was not created'),
            ],
        });
        expect(descriptor?.args[1]).toContain('process.exit(1)');
    });

    it('returns a successful command when the artifact file exists', async () => {
        const relativePath = 'artifacts/requirements.md';
        await mkdir(path.join(workspacePath, 'artifacts'), { recursive: true });
        await writeFile(path.join(workspacePath, relativePath), '# Requirements');

        const validationCommandFn = requireArtifactStep('REQ_FILE');
        const descriptor = await validationCommandFn({
            context: {
                name: 'ctx',
                variables: { REQ_FILE: relativePath },
            },
            workspacePath,
            projectRoot,
            prompt: '',
            lumpVariables: {},
            stepIndex: 0,
            contextRunState: {},
            currentIteration: 0,
            prevValidateCommandResult: null,
        });

        expect(descriptor).toMatchObject({
            executable: 'node',
            args: ['-e', 'process.exit(0)'],
        });
        expect(await pathExists(path.join(workspacePath, relativePath))).toBe(true);
    });

    it('throws when the artifact context variable is missing', async () => {
        const validationCommandFn = requireArtifactStep('REQ_FILE');
        await expect(
            validationCommandFn({
                context: {
                    name: 'ctx',
                    variables: {},
                },
                workspacePath,
                projectRoot,
                prompt: '',
                lumpVariables: {},
                stepIndex: 0,
                contextRunState: {},
                currentIteration: 0,
                prevValidateCommandResult: null,
            }),
        ).rejects.toThrow(/Missing context variable REQ_FILE/);
    });
});
