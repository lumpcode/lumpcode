import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { success } from '@lumpcode/core';

import * as installRunAbortHandlersModule from '../../../utils/installRunAbortHandlers';
import * as launchStartDaemonModule from '../../../utils/launchStartDaemon';
import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import { createTempTestDirs, removeTempTestDirs } from '../../../utils';
import { command } from '../main';
import {
    AGENTS_DOCS_URL,
    DEFAULT_LUMP_NAME,
    RUN_SUCCESS_BRANCH,
    SETUP_GITIGNORE_LINES,
    SETUP_PROMPT,
    WORKER_DOCS_URL,
    dedicatedHappyPathPrompter,
    launchStartDaemonSuccess,
    lumpConfigPath,
    makeSetupHandler,
    messagesText,
    planContextsSuccess,
    readJson,
    runLumpSuccess,
    scriptedPrompter,
    setupSetupTestRepo,
    sharedJsonHappyPathPrompter,
    teardownSetupTestRepo,
    writeFakeBinaries,
    writeGlobalCommandModule,
    type SetupTestProject,
} from './testHelpers';

vi.mock('../../../utils/planLumpFromJsConfig', async () => {
    const actual = await vi.importActual<typeof planLumpFromJsConfigModule>(
        '../../../utils/planLumpFromJsConfig',
    );
    return { ...actual, planLumpFromJsConfig: vi.fn() };
});

vi.mock('../../../utils/runLumpFromLumpName', async () => {
    const actual = await vi.importActual<typeof runLumpFromLumpNameModule>(
        '../../../utils/runLumpFromLumpName',
    );
    return { ...actual, runLumpFromLumpName: vi.fn() };
});

vi.mock('../../../utils/launchStartDaemon', async () => {
    const actual = await vi.importActual<typeof launchStartDaemonModule>(
        '../../../utils/launchStartDaemon',
    );
    return { ...actual, launchStartDaemon: vi.fn() };
});

vi.mock('../../../utils/installRunAbortHandlers', async () => {
    const actual = await vi.importActual<typeof installRunAbortHandlersModule>(
        '../../../utils/installRunAbortHandlers',
    );
    return { ...actual, installRunAbortHandlers: vi.fn(() => () => {}) };
});

describe.skip('setup command (lumpcode-setup)', () => {
    let project: SetupTestProject;

    beforeEach(async () => {
        project = await setupSetupTestRepo({ tmpPrefix: 'lump-setup-general' });
        await writeGlobalCommandModule(project.homeDir, 'my-agent');
        vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
            planContextsSuccess({ projectRoot: project.projectRoot }),
        );
        vi.mocked(runLumpFromLumpNameModule.runLumpFromLumpName).mockResolvedValue(runLumpSuccess());
        vi.mocked(launchStartDaemonModule.launchStartDaemon).mockResolvedValue(launchStartDaemonSuccess());
    });

    afterEach(async () => {
        await teardownSetupTestRepo(project);
        vi.clearAllMocks();
    });

    function handle(prompter = sharedJsonHappyPathPrompter()) {
        return makeSetupHandler({ prompter });
    }

    describe('gates', () => {
        it('fails when stdin is not a TTY and points at project-setup', async () => {
            const result = await makeSetupHandler({
                isInteractive: false,
                prompter: sharedJsonHappyPathPrompter(),
            })({ options: {}, arguments: {} });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toMatch(/project-setup/i);
            expect(planLumpFromJsConfigModule.planLumpFromJsConfig).not.toHaveBeenCalled();
        });

        it('fails when --json is set and points at project-setup', async () => {
            const result = await handle()({ options: { json: true }, arguments: {} });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toMatch(/interactive|project-setup/i);
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).not.toHaveBeenCalled();
        });

        it('resolves --projectPath via git rev-parse --show-toplevel', async () => {
            const nested = path.join(project.projectRoot, 'nested');
            await fs.mkdir(nested, { recursive: true });
            const prompter = sharedJsonHappyPathPrompter();

            const result = await handle(prompter)({
                options: { projectPath: nested },
                arguments: {},
            });

            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.data?.projectRoot).toBe(project.projectRoot);
        });
    });

    describe('preflight', () => {
        it('fails when the directory is not a git work tree', async () => {
            const dirs = await createTempTestDirs({
                prefix: 'lump-setup-nogit-',
                remote: false,
                global: false,
                mkdirLocalConfig: false,
            });
            try {
                const result = await handle()({
                    options: { projectPath: dirs.projectRoot },
                    arguments: {},
                });
                expect(result.success).toBe(false);
            } finally {
                await removeTempTestDirs(dirs);
            }
        });

        it('fails when origin is missing', async () => {
            const { execGit } = await import('../../../utils');
            execGit('remote remove origin', project.projectRoot);

            const result = await handle()({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toMatch(/origin/i);
        });

        it('fails when origin is unreachable', async () => {
            const { execGit } = await import('../../../utils');
            execGit('remote set-url origin /definitely-not-a-git-remote', project.projectRoot);

            const result = await handle()({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toMatch(/origin|ls-remote|reach/i);
        });

        it('fails when git user.name or user.email is empty', async () => {
            const { execGit } = await import('../../../utils');
            execGit('config user.name ""', project.projectRoot);
            execGit('config user.email ""', project.projectRoot);

            const result = await handle()({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toMatch(/user\.name|user\.email|identity/i);
        });
    });

    describe('fresh shared JSON happy path', () => {
        it('writes project + local config, gitignore, dirs, JSON stub, then plans and runs', async () => {
            const prompter = sharedJsonHappyPathPrompter();
            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });

            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');

            const projectJson = await readJson(path.join(project.projectRoot, '.lumpcode', 'project.json')) as {
                projectName: string;
                primaryBranch: string;
                command?: unknown;
                keepHistory?: unknown;
                primaryBranches?: unknown;
            };
            expect(projectJson.primaryBranch).toBe('main');
            expect(projectJson.command).toBeUndefined();
            expect(projectJson.keepHistory).toBeUndefined();
            expect(projectJson.primaryBranches).toBeUndefined();

            const localJson = await readJson(path.join(project.projectRoot, '.lumpcode', 'local.json')) as {
                mode: string;
                workspaceStrategy?: string;
                maxParallelRun?: number;
            };
            expect(localJson).toEqual({ mode: 'shared', workspaceStrategy: 'checkout' });

            await expect(fs.access(path.join(project.projectRoot, '.lumpcode', 'lumps'))).resolves.toBeUndefined();
            await expect(fs.access(path.join(project.projectRoot, '.lumpcode', 'commands'))).resolves.toBeUndefined();

            const gitignore = await fs.readFile(path.join(project.projectRoot, '.gitignore'), 'utf-8');
            for (const line of SETUP_GITIGNORE_LINES) {
                expect(gitignore).toContain(line);
            }

            const stub = await readJson(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')) as {
                baseBranch?: unknown;
                contextListJson: { FILE: string };
                prompt: { promptTemplate: string; command: string };
            };
            expect(stub.baseBranch).toBeUndefined();
            expect(stub.contextListJson.FILE).toBe('README.md');
            expect(stub.prompt.promptTemplate).toBe(SETUP_PROMPT);
            expect(stub.prompt.command).toBe('my-agent');

            expect(prompter.calls.some((c) => c.kind === 'pause')).toBe(true);
            expect(planLumpFromJsConfigModule.planLumpFromJsConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    lumpName: DEFAULT_LUMP_NAME,
                    depth: 'contexts',
                    projectRoot: project.projectRoot,
                }),
            );
            expect(installRunAbortHandlersModule.installRunAbortHandlers).toHaveBeenCalled();
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalledWith(
                expect.objectContaining({ lumpName: DEFAULT_LUMP_NAME }),
            );
            expect(launchStartDaemonModule.launchStartDaemon).not.toHaveBeenCalled();

            const text = messagesText(result.data.messages);
            expect(text).toContain(RUN_SUCCESS_BRANCH);
            expect(text).toMatch(/open this as a PR/i);
            expect(text).toContain(WORKER_DOCS_URL);
            expect(text).not.toMatch(/\bgh\b/);

            expect(result.data.data).toEqual(expect.objectContaining({
                projectRoot: project.projectRoot,
                lumpName: DEFAULT_LUMP_NAME,
                branchName: RUN_SUCCESS_BRANCH,
            }));
            expect(result.data.data?.startedDaemon).toBeFalsy();
        });

        it('infers primaryBranch from the current branch, not hardcoded main', async () => {
            await teardownSetupTestRepo(project);
            project = await setupSetupTestRepo({ tmpPrefix: 'lump-setup-develop', branch: 'develop' });
            await writeGlobalCommandModule(project.homeDir, 'my-agent');
            vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
                planContextsSuccess({ projectRoot: project.projectRoot }),
            );

            const prompter = sharedJsonHappyPathPrompter({
                input: (input) => {
                    if (/primary|branch/i.test(input.message)) return input.defaultValue ?? '';
                    if (/command|tag|agent/i.test(input.message)) return 'my-agent';
                    if (/lump/i.test(input.message)) return input.defaultValue ?? DEFAULT_LUMP_NAME;
                    return input.defaultValue ?? '';
                },
            });

            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);

            const projectJson = await readJson(path.join(project.projectRoot, '.lumpcode', 'project.json')) as {
                primaryBranch: string;
            };
            expect(projectJson.primaryBranch).toBe('develop');
            expect(prompter.calls.filter((c) => c.kind === 'input' && /primary|branch/i.test(c.message)))
                .toEqual(expect.arrayContaining([
                    expect.objectContaining({ defaultValue: 'develop' }),
                ]));
        });

        it('skill install default is yes; failure warns and continues', async () => {
            const binDir = path.join(project.homeDir, 'bin');
            await writeFakeBinaries(
                binDir,
                ['npx'],
                process.platform === 'win32' ? '@echo off\r\nexit /b 1\r\n' : '#!/bin/sh\nexit 1\n',
            );
            const prompter = sharedJsonHappyPathPrompter({
                confirm: (input) => {
                    if (/skill/i.test(input.message)) {
                        expect(input.defaultValue).toBe(true);
                        return true;
                    }
                    if (/run/i.test(input.message)) return true;
                    return input.defaultValue;
                },
            });

            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toMatch(/skill/i);
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalled();
            await expect(fs.access(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')))
                .resolves.toBeUndefined();
        });
    });

    describe('chooseCommand', () => {
        it('asks for a tag when no preset is on PATH and retries until getCommandPath hits', async () => {
            const missingThenHit = scriptedPrompter({
                confirm: (input) => (/skill/i.test(input.message) ? false : /run/i.test(input.message)),
                select: (input) => {
                    if (/mode/i.test(input.message)) return 'shared';
                    if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
                    if (/format|json/i.test(input.message)) return 'json';
                    if (/commit|push/i.test(input.message)) return 'cli';
                    return input.choices[0]!.value;
                },
                input: (() => {
                    let tagTries = 0;
                    return (input: { message: string; defaultValue?: string }) => {
                        if (/command|tag|agent/i.test(input.message)) {
                            tagTries += 1;
                            return tagTries === 1 ? '' : 'my-agent';
                        }
                        if (/lump/i.test(input.message)) return DEFAULT_LUMP_NAME;
                        return input.defaultValue ?? '';
                    };
                })(),
            });

            const result = await handle(missingThenHit)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            const tagInputs = missingThenHit.calls.filter(
                (c) => c.kind === 'input' && /command|tag|agent/i.test(c.message),
            );
            expect(tagInputs.length).toBeGreaterThanOrEqual(2);
            expect(messagesText(result.data.messages)).toContain(AGENTS_DOCS_URL);
            const stub = await readJson(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')) as {
                prompt: { command: string };
            };
            expect(stub.prompt.command).toBe('my-agent');
        });

        it('prints the agents docs URL when no preset is on PATH', async () => {
            const prompter = sharedJsonHappyPathPrompter();
            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(messagesText(result.data.messages)).toContain(AGENTS_DOCS_URL);
        });

        it('never silently picks the first of several PATH presets', async () => {
            await teardownSetupTestRepo(project);
            project = await setupSetupTestRepo({
                tmpPrefix: 'lump-setup-agents',
                agentBinaries: ['cursor-agent', 'copilot'],
            });
            vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
                planContextsSuccess({ projectRoot: project.projectRoot }),
            );

            const prompter = sharedJsonHappyPathPrompter({
                select: (input) => {
                    if (/mode/i.test(input.message)) return 'shared';
                    if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
                    if (/format|json/i.test(input.message)) return 'json';
                    if (/commit|push/i.test(input.message)) return 'cli';
                    if (/command|agent|preset/i.test(input.message)) {
                        const values = input.choices.map((c) => c.value);
                        expect(values).toEqual(expect.arrayContaining(['cursor', 'copilot']));
                        expect(values[0]).not.toBe('copilot');
                        return 'copilot';
                    }
                    return input.choices[0]!.value;
                },
            });

            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            const commandSelects = prompter.calls.filter(
                (c) => c.kind === 'select' && /command|agent|preset/i.test(c.message),
            );
            expect(commandSelects).toHaveLength(1);
            const stub = await readJson(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')) as {
                prompt: { command: string };
            };
            expect(stub.prompt.command).toBe('copilot');
        });

        it('confirms the only PATH preset and still offers custom', async () => {
            await teardownSetupTestRepo(project);
            project = await setupSetupTestRepo({
                tmpPrefix: 'lump-setup-one-agent',
                agentBinaries: ['cursor-agent'],
            });
            vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
                planContextsSuccess({ projectRoot: project.projectRoot }),
            );

            const prompter = scriptedPrompter({
                confirm: (input) => {
                    if (/skill/i.test(input.message)) return false;
                    if (/cursor/i.test(input.message)) return true;
                    if (/run/i.test(input.message)) return true;
                    return input.defaultValue;
                },
                select: (input) => {
                    if (/mode/i.test(input.message)) return 'shared';
                    if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
                    if (/format|json/i.test(input.message)) return 'json';
                    if (/commit|push/i.test(input.message)) return 'cli';
                    return input.choices[0]!.value;
                },
                input: (input) => input.defaultValue ?? DEFAULT_LUMP_NAME,
            });

            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            expect(prompter.calls.some((c) => c.kind === 'confirm' && /cursor/i.test(c.message))).toBe(true);
        });
    });

    describe('dedicated start', () => {
        it('asks for a dedicated wipe confirm and starts an unfiltered global daemon', async () => {
            const prompter = dedicatedHappyPathPrompter({
                confirm: (input) => {
                    if (/wipe|reset|this checkout/i.test(input.message)) {
                        expect(input.defaultValue).toBeDefined();
                        return true;
                    }
                    if (/worker|daemon|leave/i.test(input.message)) {
                        expect(input.defaultValue).toBe(true);
                        return true;
                    }
                    if (/skill/i.test(input.message)) return false;
                    if (/run/i.test(input.message)) return true;
                    return input.defaultValue;
                },
            });

            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');

            const localJson = await readJson(path.join(project.projectRoot, '.lumpcode', 'local.json')) as {
                mode: string;
            };
            expect(localJson.mode).toBe('dedicated');

            expect(launchStartDaemonModule.launchStartDaemon).toHaveBeenCalledTimes(1);
            expect(launchStartDaemonModule.launchStartDaemon).toHaveBeenCalledWith(
                expect.objectContaining({
                    recipe: expect.objectContaining({
                        daemonId: 'global',
                        projectRoot: project.projectRoot,
                    }),
                    foreground: false,
                }),
            );
            const recipe = vi.mocked(launchStartDaemonModule.launchStartDaemon).mock.calls[0]![0].recipe;
            expect(recipe.include).toBeUndefined();
            expect(recipe.exclude).toBeUndefined();

            expect(result.data.data?.startedDaemon).toBe(true);
            expect(messagesText(result.data.messages)).toMatch(/daemon-status|daemon-log|\bstop\b/);
        });

        it('skips start when the operator declines, and does not start after a failed run', async () => {
            const declineStart = dedicatedHappyPathPrompter({
                confirm: (input) => {
                    if (/wipe|reset|this checkout/i.test(input.message)) return true;
                    if (/worker|daemon|leave/i.test(input.message)) return false;
                    if (/skill/i.test(input.message)) return false;
                    if (/run/i.test(input.message)) return true;
                    return input.defaultValue;
                },
            });
            const declined = await handle(declineStart)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(declined.success).toBe(true);
            expect(launchStartDaemonModule.launchStartDaemon).not.toHaveBeenCalled();

            await teardownSetupTestRepo(project);
            project = await setupSetupTestRepo({ tmpPrefix: 'lump-setup-runfail' });
            await writeGlobalCommandModule(project.homeDir, 'my-agent');
            vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
                planContextsSuccess({ projectRoot: project.projectRoot }),
            );
            vi.mocked(runLumpFromLumpNameModule.runLumpFromLumpName).mockResolvedValue(
                { success: false, data: { messages: ['step walk failed'] } } as never,
            );

            const afterFail = await handle(dedicatedHappyPathPrompter())({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(afterFail.success).toBe(false);
            expect(launchStartDaemonModule.launchStartDaemon).not.toHaveBeenCalled();
        });

        it('declining run still offers dedicated start and does not call runLumpFromLumpName', async () => {
            const prompter = dedicatedHappyPathPrompter({
                confirm: (input) => {
                    if (/wipe|reset|this checkout/i.test(input.message)) return true;
                    if (/run/i.test(input.message)) return false;
                    if (/worker|daemon|leave/i.test(input.message)) return true;
                    if (/skill/i.test(input.message)) return false;
                    return input.defaultValue;
                },
            });

            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).not.toHaveBeenCalled();
            expect(launchStartDaemonModule.launchStartDaemon).toHaveBeenCalled();
        });
    });

    describe('run', () => {
        it('returns to editLump when the plan is empty and does not run', async () => {
            let planCalls = 0;
            vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockImplementation(async () => {
                planCalls += 1;
                if (planCalls === 1) {
                    return planContextsSuccess({ projectRoot: project.projectRoot, contexts: [] });
                }
                return planContextsSuccess({ projectRoot: project.projectRoot });
            });

            const prompter = sharedJsonHappyPathPrompter();
            const result = await handle(prompter)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            expect(planCalls).toBeGreaterThanOrEqual(2);
            expect(prompter.calls.filter((c) => c.kind === 'pause').length).toBeGreaterThanOrEqual(2);
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalledTimes(1);
        });

        it('runs through runLumpFromLumpName rather than a run-command handler', async () => {
            const result = await handle()({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(result.success).toBe(true);
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalledTimes(1);
            expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalledWith(
                expect.objectContaining({
                    lumpName: DEFAULT_LUMP_NAME,
                    sourceProjectRoot: project.projectRoot,
                }),
            );
        });
    });

    describe('worktree maxParallelRun', () => {
        it('omits maxParallelRun when the value is 1 and writes it when greater', async () => {
            const omitOne = sharedJsonHappyPathPrompter({
                select: (input) => {
                    if (/mode/i.test(input.message)) return 'shared';
                    if (/strategy|checkout|worktree/i.test(input.message)) return 'worktree';
                    if (/format|json/i.test(input.message)) return 'json';
                    if (/commit|push/i.test(input.message)) return 'cli';
                    return input.choices[0]!.value;
                },
                input: (input) => {
                    if (/parallel|maxParallel/i.test(input.message)) return '1';
                    if (/command|tag|agent/i.test(input.message)) return 'my-agent';
                    if (/lump/i.test(input.message)) return DEFAULT_LUMP_NAME;
                    return input.defaultValue ?? '';
                },
            });
            const first = await handle(omitOne)({
                options: { projectPath: project.projectRoot },
                arguments: {},
            });
            expect(first.success).toBe(true);
            const localOne = await readJson(path.join(project.projectRoot, '.lumpcode', 'local.json')) as {
                workspaceStrategy?: string;
                maxParallelRun?: number;
            };
            expect(localOne.workspaceStrategy).toBe('worktree');
            expect(localOne.maxParallelRun).toBeUndefined();
        });
    });

    describe('command module', () => {
        it('is registered as setup with optional projectPath only (no mode / yes / lumpName flags)', () => {
            expect(command.name).toBe('setup');
            const optionKeys = Object.keys(command.inputSchema.shape.options.shape);
            expect(optionKeys).toEqual(expect.arrayContaining(['projectPath', 'json', 'verbose']));
            expect(optionKeys).not.toEqual(expect.arrayContaining([
                'mode',
                'yes',
                'lumpName',
                'primaryBranch',
            ]));
        });
    });
});
