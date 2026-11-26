import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runLump, success, type Agent } from '@lumpcode/core';

import type { LumpJsConfig } from '../../../types';
import { createTempTestDirs, initLocalGitRepo, removeTempTestDirs } from '../..';
import { jsConfigToRunLumpInput } from '../main';
import { lumpHistoryFilePath } from '../../lumpHistoryFilePath';
import { noopLogger } from '../../noopLogger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function commandModuleSource(input: {
    name: string;
    argvFile: string;
    setupFile: string;
    teardownFile: string;
}): string {
    const printExpr = JSON.stringify(`process.stdout.write(${JSON.stringify(`${input.name}\n`)})`);
    return [
        `import { appendFileSync, writeFileSync } from 'node:fs';`,
        `const name = ${JSON.stringify(input.name)};`,
        `export const setup = () => {`,
        `    appendFileSync(${JSON.stringify(input.setupFile)}, name + '\\n');`,
        `    return { sessionId: name + '-setup', contextRunState: { setupChatId: name + '-setup' } };`,
        `};`,
        `export const command = async ({ prompt, sessionId }) => {`,
        `    appendFileSync(${JSON.stringify(input.argvFile)}, JSON.stringify({ command: name, prompt, sessionId }) + '\\n');`,
        `    return { executable: process.execPath, args: ['-e', ${printExpr}] };`,
        `};`,
        `export const teardown = () => {`,
        `    writeFileSync(${JSON.stringify(input.teardownFile)}, name);`,
        `};`,
        '',
    ].join('\n');
}

// Skipped until the agent-sessions implementation. Unskip this block; do not rewrite it.
describe.skip('workflow agent sessions', () => {
    it('runs two fixture presets from one workflow without registerCommands', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-agent-sessions-', remote: false });
        const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = dirs;
        try {
            initLocalGitRepo({ cwd: projectRoot });
            const argvFile = path.join(projectRoot, 'argv.jsonl');
            const setupFile = path.join(projectRoot, 'setup.txt');
            const alphaTeardown = path.join(projectRoot, 'alpha-teardown.txt');
            const betaTeardown = path.join(projectRoot, 'beta-teardown.txt');
            const commandsDir = path.join(localConfigFolderPath, 'commands');
            await mkdir(commandsDir, { recursive: true });
            await writeFile(path.join(commandsDir, 'alpha.ts'), commandModuleSource({
                name: 'alpha',
                argvFile,
                setupFile,
                teardownFile: alphaTeardown,
            }));
            await writeFile(path.join(commandsDir, 'beta.ts'), commandModuleSource({
                name: 'beta',
                argvFile,
                setupFile,
                teardownFile: betaTeardown,
            }));

            let transcript = '';
            const config = {
                command: 'alpha',
                getContextListFn: () => [{ name: 'ctx', variables: {} }],
                keepHistory: true,
                skipCommitAndPush: true,
                workflow: async ({ agent }: { agent: Agent }) => {
                    await agent.prompt('via-default');
                    const beta = await agent.session('beta');
                    await beta.prompt('via-beta');
                },
            } as LumpJsConfig;
            expect(config).not.toHaveProperty('registerCommands');

            const resolved = await jsConfigToRunLumpInput({
                config,
                lumpName: 'agent-sessions',
                localConfigFolderPath,
                globalConfigFolderPath: globalConfigFolderPath!,
                projectBaseBranch: 'main',
                executionWorkspacePath: projectRoot,
                logger: noopLogger,
                liveStepWrite: (text) => {
                    transcript += text;
                },
            });
            expect(resolved.success, resolved.success ? '' : resolved.data).toBe(true);
            if (!resolved.success) return;

            expect(resolved.data.workflow).toEqual(expect.any(Function));
            expect(resolved.data.createAgent).toEqual(expect.any(Function));
            expect(resolved.data.steps).toBeUndefined();

            const run = await runLump({
                ...resolved.data,
                setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
                teardownWorkspaceFn: async () => '',
                gitAddCommitFn: async () => success(undefined),
                gitPushFn: async () => success(undefined),
            });
            expect(run.success, run.success ? '' : run.data.message).toBe(true);

            const argv = (await readFile(argvFile, 'utf8'))
                .split('\n')
                .filter((line) => line.length > 0)
                .map((line) => JSON.parse(line) as { command: string; prompt: string; sessionId: string });
            expect(argv.map((record) => record.command)).toEqual(['alpha', 'beta']);
            expect(argv[0]).toMatchObject({ prompt: 'via-default', sessionId: 'alpha-setup' });
            expect(argv[1]?.prompt).toBe('via-beta');
            expect(argv[1]?.sessionId).toMatch(UUID);
            expect(await readFile(setupFile, 'utf8')).toBe('alpha\nbeta\n');
            expect(await readFile(alphaTeardown, 'utf8')).toBe('alpha');
            expect(await readFile(betaTeardown, 'utf8')).toBe('beta');
            expect(transcript).toContain('alpha\n');
            expect(transcript).toContain('beta\n');

            const history = await readFile(lumpHistoryFilePath({
                projectRoot,
                lumpName: 'agent-sessions',
                contextName: 'ctx',
            }), 'utf8');
            expect(history).toContain('command: alpha');
            expect(history).toContain('command: beta');
        } finally {
            await removeTempTestDirs(dirs);
        }
    });
});
