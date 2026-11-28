import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { AgentResult, AgentSession, PromptOptions } from '@lumpcode/core';

import { requireArtifact } from './requireArtifact';

// Skipped until the impl stage fills in the workflow helper. Unskip; do not rewrite.
describe('requireArtifact', () => {
    const roots: string[] = [];

    afterEach(async () => {
        await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
    });

    it('returns succeeded without prompting when the file is already there', async () => {
        const workspacePath = await makeWorkspace();
        const relativePath = 'notes/out.md';
        await mkdir(path.join(workspacePath, 'notes'), { recursive: true });
        await writeFile(path.join(workspacePath, relativePath), 'here');
        const { session, prompts } = createSession();

        const result = await requireArtifact({
            session,
            workspacePath,
            path: relativePath,
        });

        expect(result).toEqual({ succeeded: true, path: relativePath });
        expect(prompts).toEqual([]);
    });

    it('prompts with the default text until the file exists', async () => {
        const workspacePath = await makeWorkspace();
        const relativePath = 'notes/out.md';
        const { session, prompts } = createSession(async () => {
            await mkdir(path.join(workspacePath, 'notes'), { recursive: true });
            await writeFile(path.join(workspacePath, relativePath), 'written');
        });

        const result = await requireArtifact({ session, workspacePath, path: relativePath });

        expect(result).toEqual({ succeeded: true, path: relativePath });
        expect(prompts.map((prompt) => prompt.text)).toEqual(['Write notes/out.md. It is missing.']);
    });

    it('uses a custom prompt', async () => {
        const workspacePath = await makeWorkspace();
        const { session, prompts } = createSession(async () => {
            await writeFile(path.join(workspacePath, 'note.md'), 'written');
        });

        await requireArtifact({
            session,
            workspacePath,
            path: 'note.md',
            prompt: 'Please add note.md.',
        });

        expect(prompts.map((prompt) => prompt.text)).toEqual(['Please add note.md.']);
    });

    it('stops after maxAttempts prompts when the file never appears', async () => {
        const workspacePath = await makeWorkspace();
        const { session, prompts } = createSession();

        const result = await requireArtifact({
            session,
            workspacePath,
            path: 'missing.md',
            maxAttempts: 1,
        });

        expect(result).toEqual({ succeeded: false, path: 'missing.md' });
        expect(prompts).toHaveLength(1);
    });

    it('defaults to two prompts', async () => {
        const workspacePath = await makeWorkspace();
        const { session, prompts } = createSession();

        const result = await requireArtifact({
            session,
            workspacePath,
            path: 'missing.md',
        });

        expect(result).toEqual({ succeeded: false, path: 'missing.md' });
        expect(prompts).toHaveLength(2);
        expect(prompts.every((prompt) => prompt.text === 'Write missing.md. It is missing.')).toBe(true);
    });

    it('succeeds when the file appears on the last prompt', async () => {
        const workspacePath = await makeWorkspace();
        let calls = 0;
        const { session, prompts } = createSession(async () => {
            calls += 1;
            if (calls === 2) {
                await writeFile(path.join(workspacePath, 'late.md'), 'written');
            }
        });

        const result = await requireArtifact({
            session,
            workspacePath,
            path: 'late.md',
        });

        expect(result).toEqual({ succeeded: true, path: 'late.md' });
        expect(prompts).toHaveLength(2);
    });

    it('propagates an abort from the prompt', async () => {
        const workspacePath = await makeWorkspace();
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        const session: AgentSession = {
            command: 'cursor',
            sessionId: 's1',
            async prompt() {
                throw error;
            },
        };

        await expect(requireArtifact({
            session,
            workspacePath,
            path: 'missing.md',
            maxAttempts: 1,
        })).rejects.toBe(error);
    });

    async function makeWorkspace(): Promise<string> {
        const workspacePath = await mkdtemp(path.join(tmpdir(), 'require-artifact-'));
        roots.push(workspacePath);
        return workspacePath;
    }
});

function createSession(onPrompt?: () => Promise<void>) {
    const prompts: { text: string; options?: PromptOptions }[] = [];
    const session: AgentSession = {
        command: 'cursor',
        sessionId: 's1',
        async prompt(text, options) {
            prompts.push({ text, options });
            await onPrompt?.();
            const result: AgentResult = { output: 'ok', succeeded: true, exitCode: 0, timedOut: false };
            return result;
        },
    };
    return { session, prompts };
}
