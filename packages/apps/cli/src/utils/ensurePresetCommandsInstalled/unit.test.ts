import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CommandFn, GetContextListFn, PromptFn, Step } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types';
import { jsConfigToRunLumpInput } from '../jsConfigToRunLumpInput';
import {
    ensurePresetCommandsInstalled,
    installPresetCommands,
    listBundledPresetCommandNames,
} from './main';

const bundlePresetsDir = path.resolve(__dirname, '../../presets/commands');
const jsConfigFixturesDir = path.resolve(__dirname, '../jsConfigToRunLumpInput/__fixtures__');

const DEFAULT_TEST_LOCAL_CONFIG = path.join('/tmp', 'project', '.lumpcode');
const DEFAULT_TEST_GLOBAL_CONFIG = path.join('/tmp', 'project', '.lumpcode-global-fixture');
const DEFAULT_TEST_WORKSPACE = path.join('/tmp', 'project');
const DEFAULT_TEST_PROJECT_BASE_BRANCH = 'main';

const stubCommandFn: CommandFn = () => ({ executable: 'test-cli', args: ['-p'] });
const stubGetContextListFn: GetContextListFn = () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }];
const stubPromptFn: PromptFn = () => 'do something';

function makeConfig(overrides: Partial<LumpJsConfig> = {}): LumpJsConfig {
    return {
        getContextListFn: stubGetContextListFn,
        prompt: { promptFn: stubPromptFn, commandFn: stubCommandFn },
        ...overrides,
    } as LumpJsConfig;
}

function resolveJsConf(
    configOverrides: Partial<LumpJsConfig>,
    opts: {
        lumpName?: string;
        localConfigFolderPath?: string;
        globalConfigFolderPath?: string;
        projectBaseBranch?: string;
        executionWorkspacePath?: string;
        workspaceStrategy?: 'checkout' | 'worktree';
    } = {},
) {
    return jsConfigToRunLumpInput({
        config: makeConfig(configOverrides),
        lumpName: opts.lumpName ?? 'my-lump',
        localConfigFolderPath: opts.localConfigFolderPath ?? DEFAULT_TEST_LOCAL_CONFIG,
        globalConfigFolderPath: opts.globalConfigFolderPath ?? DEFAULT_TEST_GLOBAL_CONFIG,
        projectBaseBranch: opts.projectBaseBranch ?? DEFAULT_TEST_PROJECT_BASE_BRANCH,
        executionWorkspacePath: opts.executionWorkspacePath ?? DEFAULT_TEST_WORKSPACE,
        workspaceStrategy: opts.workspaceStrategy ?? 'checkout',
    });
}

const commandFnCallArgs = {
    context: { name: 'ctx', variables: {} },
    prompt: 'test',
    stepIndex: 0,
    contextRunState: {},
    lumpVariables: {},
    projectRoot: '/tmp',
    workspacePath: '/tmp',
} as const;

function assertSuccess<T>(result: { success: true; data: T } | { success: false; data: string }): T {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    return result.data;
}

async function withInstalledPresets(run: (globalConfigFolderPath: string) => Promise<void>) {
    const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-preset-resolution-'));
    try {
        const installResult = await ensurePresetCommandsInstalled({
            globalConfigFolderPath,
            bundlePresetsDir,
        });
        expect(installResult.success).toBe(true);
        await run(globalConfigFolderPath);
    } finally {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    }
}

describe('installPresetCommands', () => {
    it('installs bundled presets when missing', async () => {
        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-presets-'));
        try {
            const result = await installPresetCommands({
                bundlePresetsDir,
                globalConfigFolderPath,
            });
            expect(result).toEqual({ installed: true, count: (await listBundledPresetCommandNames(bundlePresetsDir)).length });

            for (const name of await listBundledPresetCommandNames(bundlePresetsDir)) {
                const dest = path.join(globalConfigFolderPath, 'commands', 'presets', name);
                const installed = await fs.readFile(dest, 'utf-8');
                const source = await fs.readFile(path.join(bundlePresetsDir, name), 'utf-8');
                expect(installed).toBe(source);
            }

            const utilsDest = path.join(globalConfigFolderPath, 'commands', 'presets', 'utils', 'resolveAgentPermissions.js');
            const utilsSource = path.join(bundlePresetsDir, 'utils', 'resolveAgentPermissions.js');
            expect(await fs.readFile(utilsDest, 'utf-8')).toBe(await fs.readFile(utilsSource, 'utf-8'));
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });

    it('does not list preset utils helpers as invokable command names', async () => {
        const names = await listBundledPresetCommandNames(bundlePresetsDir);
        expect(names).not.toContain('resolveAgentPermissions.js');
        expect(names).not.toContain('utils');
    });

    it('does not overwrite existing preset files by default', async () => {
        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-presets-'));
        try {
            const destDir = path.join(globalConfigFolderPath, 'commands', 'presets');
            await fs.mkdir(destDir, { recursive: true });
            await fs.writeFile(path.join(destDir, 'cursor.js'), 'export const command = () => ({ executable: "custom" });');

            const result = await installPresetCommands({
                bundlePresetsDir,
                globalConfigFolderPath,
            });
            expect(result.installed).toBe(true);

            const cursorContents = await fs.readFile(path.join(destDir, 'cursor.js'), 'utf-8');
            expect(cursorContents).toContain('custom');
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });

    it('overwrites existing preset files when overwrite is true', async () => {
        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-presets-'));
        try {
            const destDir = path.join(globalConfigFolderPath, 'commands', 'presets');
            await fs.mkdir(destDir, { recursive: true });
            await fs.writeFile(path.join(destDir, 'cursor.js'), 'export const command = () => ({ executable: "custom" });');

            const result = await installPresetCommands({
                bundlePresetsDir,
                globalConfigFolderPath,
                overwrite: true,
            });
            expect(result.installed).toBe(true);

            const cursorContents = await fs.readFile(path.join(destDir, 'cursor.js'), 'utf-8');
            const source = await fs.readFile(path.join(bundlePresetsDir, 'cursor.js'), 'utf-8');
            expect(cursorContents).toBe(source);
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });

    it('returns missing-bundle-presets when the bundle directory is absent', async () => {
        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-presets-'));
        try {
            const result = await installPresetCommands({
                bundlePresetsDir: path.join(globalConfigFolderPath, 'missing-presets'),
                globalConfigFolderPath,
            });
            expect(result).toEqual({ installed: false, reason: 'missing-bundle-presets' });
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });
});

describe('ensurePresetCommandsInstalled', () => {
    it('wraps installPresetCommands as Success/Failure', async () => {
        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-presets-'));
        try {
            const result = await ensurePresetCommandsInstalled({
                globalConfigFolderPath,
                bundlePresetsDir,
                overwrite: true,
            });
            expect(result.success).toBe(true);
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });

    it('returns failure when the bundle directory is absent', async () => {
        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-presets-'));
        try {
            const result = await ensurePresetCommandsInstalled({
                globalConfigFolderPath,
                bundlePresetsDir: path.join(globalConfigFolderPath, 'missing-presets'),
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.data).toContain('missing-bundle-presets');
            }
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });
});

describe('installed preset command resolution', () => {
    it('should fall back to a shipped preset when local and global overrides are missing', async () => {
        await withInstalledPresets(async (globalConfigFolderPath) => {
            const data = assertSuccess(await resolveJsConf(
                { command: 'cursor', prompt: 'Do something' },
                {
                    localConfigFolderPath: path.join(jsConfigFixturesDir, 'nonexistent-local'),
                    globalConfigFolderPath,
                },
            ));
            const item = data.steps[0] as Step;
            expect(item.commandFn.commandName).toBe('cursor');
            expect(await item.commandFn({
                ...commandFnCallArgs,
                prompt: 'hello',
                contextRunState: {
                    cursorSetup: {
                        setupChatId: 'test-chat-id',
                    },
                },
            })).toEqual({
                executable: 'cursor-agent',
                args: [
                    '-p',
                    'hello',
                    '--force',
                    '--trust',
                    '--workspace',
                    '/tmp',
                    '--sandbox',
                    'enabled',
                    '--model',
                    'auto',
                    '--resume',
                    'test-chat-id',
                ],
            });
        });
    });

    it('should set CURSOR_CONFIG_DIR when cursorConfigDir is in lumpVariables', async () => {
        await withInstalledPresets(async (globalConfigFolderPath) => {
            const data = assertSuccess(await resolveJsConf(
                {
                    command: 'cursor',
                    prompt: 'Do something',
                    lumpVariables: {
                        agentPermissions: { cursorConfigDir: '.lumpcode/cursor' },
                    },
                },
                {
                    localConfigFolderPath: path.join(jsConfigFixturesDir, 'nonexistent-local'),
                    globalConfigFolderPath,
                },
            ));
            const item = data.steps[0] as Step;
            expect(await item.commandFn({
                ...commandFnCallArgs,
                prompt: 'hello',
                lumpVariables: {
                    agentPermissions: { cursorConfigDir: '.lumpcode/cursor' },
                },
                contextRunState: {
                    cursorSetup: {
                        setupChatId: 'test-chat-id',
                    },
                },
            })).toEqual({
                executable: 'cursor-agent',
                env: { CURSOR_CONFIG_DIR: path.join('/tmp', '.lumpcode/cursor') },
                args: [
                    '-p',
                    'hello',
                    '--force',
                    '--trust',
                    '--workspace',
                    '/tmp',
                    '--sandbox',
                    'enabled',
                    '--model',
                    'auto',
                    '--resume',
                    'test-chat-id',
                ],
            });
        });
    });

    it('should resolve the copilot preset with session resume from setup state', async () => {
        await withInstalledPresets(async (globalConfigFolderPath) => {
            const data = assertSuccess(await resolveJsConf(
                { command: 'copilot', prompt: 'Do something' },
                {
                    localConfigFolderPath: path.join(jsConfigFixturesDir, 'nonexistent-local'),
                    globalConfigFolderPath,
                },
            ));
            const item = data.steps[0] as Step;
            expect(item.commandFn.commandName).toBe('copilot');
            expect(await item.commandFn({
                ...commandFnCallArgs,
                prompt: 'hello',
                contextRunState: {
                    copilotSetup: {
                        setupChatId: 'test-session-id',
                    },
                },
            })).toEqual({
                executable: 'copilot',
                args: [
                    '-p',
                    'hello',
                    '--no-ask-user',
                    '--silent',
                    '--allow-all-tools',
                    '--deny-tool=shell(git commit)',
                    '--deny-tool=shell(git push)',
                    '--model',
                    'auto',
                    '--session-id',
                    'test-session-id',
                ],
            });
        });
    });

    it('should apply copilot writablePaths via allow-tool flags', async () => {
        await withInstalledPresets(async (globalConfigFolderPath) => {
            const data = assertSuccess(await resolveJsConf(
                {
                    command: 'copilot',
                    prompt: 'Do something',
                    lumpVariables: {
                        agentPermissions: {
                            writablePaths: ['packages/core/src/**'],
                            denyShell: ['shell(rm)'],
                        },
                    },
                },
                {
                    localConfigFolderPath: path.join(jsConfigFixturesDir, 'nonexistent-local'),
                    globalConfigFolderPath,
                },
            ));
            const item = data.steps[0] as Step;
            expect(await item.commandFn({
                ...commandFnCallArgs,
                prompt: 'hello',
                lumpVariables: {
                    agentPermissions: {
                        writablePaths: ['packages/core/src/**'],
                        denyShell: ['shell(rm)'],
                    },
                },
                contextRunState: {
                    copilotSetup: {
                        setupChatId: 'test-session-id',
                    },
                },
            })).toEqual({
                executable: 'copilot',
                args: [
                    '-p',
                    'hello',
                    '--no-ask-user',
                    '--silent',
                    '--allow-tool=read',
                    '--allow-tool=write(packages/core/src/**)',
                    '--allow-tool=shell(*)',
                    '--deny-tool=shell(git commit)',
                    '--deny-tool=shell(git push)',
                    '--deny-tool=shell(rm)',
                    '--model',
                    'auto',
                    '--session-id',
                    'test-session-id',
                ],
            });
        });
    });

    it('should fail with an actionable error for an unknown command name', async () => {
        await withInstalledPresets(async (globalConfigFolderPath) => {
            const result = await resolveJsConf(
                { command: 'unknown-agent', prompt: 'Do something' },
                {
                    localConfigFolderPath: path.join(jsConfigFixturesDir, 'nonexistent-local'),
                    globalConfigFolderPath,
                },
            );
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain("Failed to load command module 'unknown-agent'");
        });
    });
});
