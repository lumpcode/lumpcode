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

    it('fails when the artifact file was not created', async () => {
        const step = requireArtifactStep('REQ_FILE');
        await expect(
            step.commandFn!({
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
            }),
        ).rejects.toThrow(/Expected artifact/);
    });

    it('succeeds when the artifact file exists', async () => {
        const relativePath = 'artifacts/requirements.md';
        await mkdir(path.join(workspacePath, 'artifacts'), { recursive: true });
        await writeFile(path.join(workspacePath, relativePath), '# Requirements');

        const step = requireArtifactStep('REQ_FILE');
        const descriptor = await step.commandFn!({
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
        });

        expect(descriptor).toMatchObject({ executable: 'node' });
        expect(await pathExists(path.join(workspacePath, relativePath))).toBe(true);
    });
});
