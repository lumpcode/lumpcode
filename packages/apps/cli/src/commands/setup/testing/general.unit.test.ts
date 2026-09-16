import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import * as core from '@lumpcode/core';

import {
    createTempTestDirs,
    execGit,
    initBareRemoteAndCheckout,
    removeTempTestDirs,
} from '../../../utils';
import * as installRunAbortHandlersModule from '../../../utils/installRunAbortHandlers';
import * as launchStartDaemonModule from '../../../utils/launchStartDaemon';
import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import { command, type Injections, type SetupPrompter } from '../main';

const README_CONTEXT = { name: 'README', variables: { FILE: 'README.md' } };
const ORIGINAL_PATH = process.env.PATH;
const WORKER_URL = 'https://www.lumpcode.com/docs/start/worker';
const AGENTS_DOCS = 'docs/author/agents';

function defaultPrompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
    return {
        confirm: async ({ defaultValue }) => defaultValue,
        select: async ({ choices }) => choices[0]!.value,
        input: async ({ defaultValue }) => defaultValue ?? '',
        pause: async () => {},
        ...overrides,
    };
}

function makeHandler(injections: Injections = {}) {
    return command.handlerMaker({ isInteractive: () => true, ...injections });
}

function isolatedPath(binDir: string): string {
    const dirs = [binDir, path.dirname(process.execPath)];
    try {
        const git = execSync(process.platform === 'win32' ? 'where git' : 'command -v git', {
            encoding: 'utf-8',
        })
            .split(/\r?\n/)[0]
            ?.trim();
        if (git) dirs.push(path.dirname(git));
    } catch {
        // keep node + bin dir
    }
    return dirs.join(path.delimiter);
}

async function writeFakeBin(binDir: string, name: string) {
    await fs.mkdir(binDir, { recursive: true });
    if (process.platform === 'win32') {
        await fs.writeFile(path.join(binDir, `${name}.cmd`), '@echo off\r\nexit /b 0\r\n');
        return;
    }
    await fs.writeFile(path.join(binDir, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
}

function planOk(
    projectRoot: string,
    contexts: typeof README_CONTEXT[],
): Awaited<ReturnType<typeof planLumpFromJsConfigModule.planLumpFromJsConfig>> {
    return core.success({
        lumpName: 'myFirstLump',
        valid: true,
        disabled: false,
        discoveryBranch: 'main',
        baseBranch: 'main',
        executionWorkspacePath: projectRoot,
        mode: 'shared',
        workspaceStrategy: 'checkout',
        contexts,
        todoContextNames: contexts.map((context) => context.name),
    });
}

/**
 * Skipped until `lumpcode setup` lands (setup-first-pr-drive).
 */
describe('setup command', () => {
    it('fails when stdin is not a TTY and points at project-setup', async () => {
        const result = await makeHandler({ isInteractive: () => false })({
            options: {},
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join('\n')).toMatch(/project-setup/);
    });

    it('fails when --json is set because setup is interactive', async () => {
        const result = await makeHandler()({ options: { json: true }, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages.join('\n')).toMatch(/interactive/i);
    });

    describe('fresh shared JSON drive', () => {
        let projectRoot: string;
        let remoteDir: string;
        let binDir: string;
        let runSpy: MockInstance<typeof runLumpFromLumpNameModule.runLumpFromLumpName>;
        let planSpy: MockInstance<typeof planLumpFromJsConfigModule.planLumpFromJsConfig>;
        let startSpy: MockInstance<typeof launchStartDaemonModule.launchStartDaemon>;

        beforeEach(async () => {
            ({ projectRoot, remoteDir } = await createTempTestDirs({
                prefix: 'lump-setup-',
                global: false,
                mkdirLocalConfig: false,
            }));
            binDir = path.join(projectRoot, '.setup-bins');
            initBareRemoteAndCheckout({ projectRoot, remoteDir });
            await fs.writeFile(path.join(projectRoot, 'README.md'), '# hi\n');
            await writeFakeBin(binDir, 'cursor-agent');
            process.env.PATH = isolatedPath(binDir);

            planSpy = vi.spyOn(planLumpFromJsConfigModule, 'planLumpFromJsConfig').mockResolvedValue(
                planOk(projectRoot, [README_CONTEXT]),
            );
            runSpy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName').mockResolvedValue(
                core.success({
                    skipped: false,
                    result: {
                        branchName: 'lump/myFirstLump/README',
                        contextNames: ['README'],
                        contextRunStateList: [],
                    },
                }) as Awaited<ReturnType<typeof runLumpFromLumpNameModule.runLumpFromLumpName>>,
            );
            startSpy = vi.spyOn(launchStartDaemonModule, 'launchStartDaemon').mockResolvedValue(
                core.success({
                    messages: [],
                    data: {
                        cronSetup: '*/5 * * * *',
                        lumpNames: ['myFirstLump'],
                        ticks: 0,
                        daemonId: 'global',
                    },
                }),
            );
            vi.spyOn(installRunAbortHandlersModule, 'installRunAbortHandlers').mockReturnValue(() => {});
        });

        afterEach(async () => {
            process.env.PATH = ORIGINAL_PATH;
            vi.restoreAllMocks();
            await removeTempTestDirs({ projectRoot, remoteDir });
        });

        async function runSetup(prompter: SetupPrompter = defaultPrompter()) {
            return makeHandler({ prompter })({
                options: { projectPath: projectRoot },
                arguments: {},
            });
        }

        it('walks shared JSON README, cli-commits the allowlist, and runs in place on HEAD', async () => {
            await fs.writeFile(path.join(projectRoot, 'unrelated.txt'), 'leave me\n');
            const result = await runSetup();
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');

            const config = JSON.parse(
                await fs.readFile(path.join(projectRoot, '.lumpcode', 'lumps', 'myFirstLump', 'config.json'), 'utf-8'),
            ) as { contextListJson: unknown; prompt: unknown; baseBranch?: unknown };
            expect(config).toMatchObject({
                contextListJson: [README_CONTEXT],
                prompt: {
                    promptTemplate: 'clean and improve the code in @{FILE}',
                    command: 'cursor',
                },
            });
            expect(config).not.toHaveProperty('baseBranch');

            const committed = execGit('diff-tree --no-commit-id --name-only -r HEAD', projectRoot);
            expect(committed).toMatch(/\.lumpcode\/project\.json/);
            expect(committed).toMatch(/\.lumpcode\/lumps\//);
            expect(committed).not.toMatch(/local\.json/);
            expect(committed).not.toMatch(/unrelated\.txt/);
            expect(execGit('log -1 --pretty=%s', projectRoot)).toBe('Add Lumpcode setup and myFirstLump');

            expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({ lumpName: 'myFirstLump' }));
            expect(startSpy).not.toHaveBeenCalled();
            expect(result.data.data?.branchName).toBe('main');
            expect(result.data.messages.join('\n')).toMatch(/main/);
            expect(result.data.messages.join('\n')).toContain(WORKER_URL);
            expect(result.data.messages.join('\n')).not.toMatch(/open[\s\S]*lump\//i);
        });

        it('retries a custom tag until getCommandPath hits a command file', async () => {
            process.env.PATH = isolatedPath(path.join(projectRoot, '.empty-bins'));
            await fs.mkdir(path.join(projectRoot, '.empty-bins'));
            let tagAsks = 0;
            const result = await runSetup(
                defaultPrompter({
                    input: async ({ message, defaultValue }) => {
                        if (!/command|tag|agent/i.test(message)) return defaultValue ?? '';
                        tagAsks += 1;
                        if (tagAsks === 1) return 'missing-agent';
                        await fs.mkdir(path.join(projectRoot, '.lumpcode', 'commands'), { recursive: true });
                        await fs.writeFile(
                            path.join(projectRoot, '.lumpcode', 'commands', 'my-agent.js'),
                            'export async function command() { return null; }\n',
                        );
                        return 'my-agent';
                    },
                }),
            );
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.messages.join('\n')).toMatch(AGENTS_DOCS);
            expect(tagAsks).toBeGreaterThanOrEqual(2);
            const config = JSON.parse(
                await fs.readFile(path.join(projectRoot, '.lumpcode', 'lumps', 'myFirstLump', 'config.json'), 'utf-8'),
            ) as { prompt: { command: string } };
            expect(config.prompt.command).toBe('my-agent');
        });

        it('selects among several PATH presets instead of silently taking the first', async () => {
            await writeFakeBin(binDir, 'copilot');
            await writeFakeBin(binDir, 'claude');
            const selects: { message: string; values: string[] }[] = [];
            const result = await runSetup(
                defaultPrompter({
                    select: async ({ message, choices }) => {
                        selects.push({ message, values: choices.map((c) => c.value) });
                        if (/command|agent/i.test(message)) return 'copilot';
                        return choices[0]!.value;
                    },
                }),
            );
            expect(result.success).toBe(true);
            expect(selects.some((s) => s.values.includes('cursor') && s.values.includes('copilot'))).toBe(true);
            const config = JSON.parse(
                await fs.readFile(path.join(projectRoot, '.lumpcode', 'lumps', 'myFirstLump', 'config.json'), 'utf-8'),
            ) as { prompt: { command: string } };
            expect(config.prompt.command).toBe('copilot');
        });

        it('warns and continues when skill install fails', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const actualExecAsync = core.execAsync;
            vi.spyOn(core, 'execBinary').mockResolvedValue(
                core.failure({ message: 'npx failed', binaryPath: 'npx', args: ['skills', 'add', 'lumpcode/skills'] }),
            );
            vi.spyOn(core, 'execAsync').mockImplementation(async (cmd, opts) => {
                if (/npx\s+skills\s+add/.test(String(cmd))) {
                    return core.failure({
                        message: 'npx failed',
                        reason: 'exit' as const,
                        info: { command: String(cmd), stdout: '', stderr: 'npx failed' },
                    });
                }
                return actualExecAsync(cmd, opts);
            });
            const result = await runSetup();
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(runSpy).toHaveBeenCalled();
            const text = `${result.data.messages.join('\n')}\n${warnSpy.mock.calls.map((c) => String(c[0])).join('\n')}`;
            expect(text).toMatch(/skill/i);
        });

        it('returns to editLump when the plan has no contexts, then runs after a non-empty plan', async () => {
            planSpy
                .mockResolvedValueOnce(planOk(projectRoot, []))
                .mockResolvedValueOnce(planOk(projectRoot, [README_CONTEXT]));
            let pauses = 0;
            const result = await runSetup(defaultPrompter({ pause: async () => { pauses += 1; } }));
            expect(result.success).toBe(true);
            expect(pauses).toBeGreaterThanOrEqual(2);
            expect(runSpy).toHaveBeenCalledTimes(1);
        });

        it('does not run when commitPush cli git fails', async () => {
            const actualExecAsync = core.execAsync;
            vi.spyOn(core, 'execAsync').mockImplementation(async (cmd, opts) => {
                if (/\bgit\b/.test(String(cmd)) && /\bcommit\b/.test(String(cmd))) {
                    return core.failure({
                        message: 'commit failed',
                        reason: 'exit' as const,
                        info: { command: String(cmd), stdout: '', stderr: 'commit failed' },
                    });
                }
                return actualExecAsync(cmd, opts);
            });
            const result = await runSetup();
            expect(result.success).toBe(false);
            expect(runSpy).not.toHaveBeenCalled();
        });

        it('asks for a dedicated wipe confirm', async () => {
            const confirms: string[] = [];
            const result = await runSetup(
                defaultPrompter({
                    confirm: async ({ message, defaultValue }) => {
                        confirms.push(message);
                        return defaultValue;
                    },
                    select: async ({ message, choices }) => {
                        if (/mode/i.test(message)) return 'dedicated';
                        return choices[0]!.value;
                    },
                }),
            );
            expect(result.success).toBe(true);
            expect(confirms.some((m) => /reset|wipe|this checkout/i.test(m))).toBe(true);
        });
    });
});
