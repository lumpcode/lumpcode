import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import * as core from '@lumpcode/core';

import {
    createTempTestDirs,
    initBareRemoteAndCheckout,
    removeTempTestDirs,
} from '../../../utils';
import * as installRunAbortHandlersModule from '../../../utils/installRunAbortHandlers';
import * as launchStartDaemonModule from '../../../utils/launchStartDaemon';
import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import type { ContextMatchFn } from '../../../types';
import { command, type Injections, type SetupPrompter } from '../main';

const README_CONTEXT = { name: 'README', variables: { FILE: 'README.md' } };
const ORIGINAL_PATH = process.env.PATH;
const MATCH_INPUT: Omit<Parameters<ContextMatchFn>[0], 'codeBasePath'> = {
    codeBasePaths: [],
    lumpVariables: {},
    discoveryBranch: 'main',
};

type GeneratedJsStub = {
    contextMatchFn: ContextMatchFn;
    prompt: { promptTemplate: string; command: string };
};

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
        contexts: [README_CONTEXT],
        todoContextNames: [README_CONTEXT.name],
    });
}

function isFormatSelect(choices: { value: string }[]): boolean {
    const values = choices.map((choice) => choice.value);
    return values.includes('json') && values.includes('js') && values.includes('ts');
}

function isAuthoringPkgConfirm(message: string): boolean {
    return /cli-utils|recipes|authoring/i.test(message);
}

function isNpmInstallAuthoring(cmd: string): boolean {
    return /npm\s+install/.test(cmd) && /@lumpcode\/cli-utils/.test(cmd) && /@lumpcode\/recipes/.test(cmd);
}

function formatPrompter(format: 'json' | 'js' | 'ts', extra: Partial<SetupPrompter> = {}): SetupPrompter {
    return defaultPrompter({
        ...extra,
        select: async (input) => {
            if (isFormatSelect(input.choices)) return format;
            if (extra.select) return extra.select(input);
            return input.choices[0]!.value;
        },
    });
}

describe('setup command — js/ts stubs', () => {
    let projectRoot: string;
    let remoteDir: string;
    let npmInstallOk: boolean;
    let execAsyncSpy: MockInstance<typeof core.execAsync>;

    beforeEach(async () => {
        ({ projectRoot, remoteDir } = await createTempTestDirs({
            prefix: 'lump-setup-js-ts-',
            global: false,
            mkdirLocalConfig: false,
        }));
        const binDir = path.join(projectRoot, '.setup-bins');
        initBareRemoteAndCheckout({ projectRoot, remoteDir });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# hi\n');
        await writeFakeBin(binDir, 'cursor-agent');
        process.env.PATH = isolatedPath(binDir);

        vi.spyOn(planLumpFromJsConfigModule, 'planLumpFromJsConfig').mockResolvedValue(planOk(projectRoot));
        vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName').mockResolvedValue(
            core.success({
                skipped: false,
                result: {
                    branchName: 'lump/myFirstLump/README',
                    contextNames: ['README'],
                    contextRunStateList: [],
                },
            }) as Awaited<ReturnType<typeof runLumpFromLumpNameModule.runLumpFromLumpName>>,
        );
        vi.spyOn(launchStartDaemonModule, 'launchStartDaemon').mockRejectedValue(
            new Error('setup must not call launchStartDaemon'),
        );
        vi.spyOn(installRunAbortHandlersModule, 'installRunAbortHandlers').mockReturnValue(() => {});

        npmInstallOk = true;
        const actualExecAsync = core.execAsync;
        execAsyncSpy = vi.spyOn(core, 'execAsync').mockImplementation(async (cmd, opts) => {
            if (/npx\s+skills\s+add/.test(String(cmd))) {
                return core.success({ stdout: '', stderr: '' });
            }
            if (isNpmInstallAuthoring(String(cmd))) {
                if (!npmInstallOk) {
                    return core.failure({
                        message: 'npm failed',
                        reason: 'exit' as const,
                        info: { command: String(cmd), stdout: '', stderr: 'npm failed' },
                    });
                }
                return core.success({ stdout: '', stderr: '' });
            }
            return actualExecAsync(cmd, opts);
        });
    });

    afterEach(async () => {
        process.env.PATH = ORIGINAL_PATH;
        vi.restoreAllMocks();
        await removeTempTestDirs({ projectRoot, remoteDir });
    });

    async function runSetup(prompter: SetupPrompter) {
        return makeHandler({ prompter })({
            options: { projectPath: projectRoot },
            arguments: {},
        });
    }

    function lumpConfigPath(fileName: string): string {
        return path.join(projectRoot, '.lumpcode', 'lumps', 'myFirstLump', fileName);
    }

    function npmInstallCalls(): string[] {
        return execAsyncSpy.mock.calls
            .filter(([cmd, opts]) => isNpmInstallAuthoring(String(cmd)) && opts?.cwd === projectRoot)
            .map(([cmd]) => String(cmd));
    }

    it.each(['js', 'ts'] as const)(
        'writes a contextMatchFn stub for %s over the format default suffix and installs authoring packages',
        async (format) => {
            await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
            await fs.writeFile(path.join(projectRoot, 'src', 'foo.bar.js'), 'export const n = 1;\n');
            await fs.writeFile(path.join(projectRoot, 'src', 'foo.bar.ts'), 'export const n = 1;\n');
            const confirms: { message: string; defaultValue: boolean }[] = [];
            const result = await runSetup(
                formatPrompter(format, {
                    confirm: async (input) => {
                        confirms.push(input);
                        return input.defaultValue;
                    },
                }),
            );
            expect(result.success).toBe(true);
            expect(await fs.access(lumpConfigPath(`config.${format}`)).then(() => true)).toBe(true);
            expect(await fs.access(lumpConfigPath('config.json')).then(() => true, () => false)).toBe(false);

            const source = await fs.readFile(lumpConfigPath(`config.${format}`), 'utf-8');
            expect(source).toMatch(/contextMatchFn/);
            expect(source).toMatch(/contextNameFromPath/);
            expect(source).toMatch(/clean and improve the code in @\{FILE\}/);
            expect(source).not.toMatch(/defineConfig/);
            expect(source).not.toMatch(/@lumpcode\/recipes/);
            expect(source).not.toMatch(/from ['"]@lumpcode\/cli-utils['"]/);
            expect(source).not.toMatch(/\bbaseBranch\b/);

            if (format === 'js') {
                const loaded = (await import(pathToFileURL(lumpConfigPath('config.js')).href)).default as GeneratedJsStub;
                expect(loaded.prompt).toEqual({
                    promptTemplate: 'clean and improve the code in @{FILE}',
                    command: 'cursor',
                });
                expect(loaded).not.toHaveProperty('baseBranch');
                expect(await loaded.contextMatchFn({ ...MATCH_INPUT, codeBasePath: { path: 'src', isDir: true } })).toBeNull();
                expect(
                    await loaded.contextMatchFn({ ...MATCH_INPUT, codeBasePath: { path: 'src/hello.ts', isDir: false } }),
                ).toBeNull();
                expect(
                    await loaded.contextMatchFn({
                        ...MATCH_INPUT,
                        codeBasePath: { path: 'node_modules/leftpad/index.js', isDir: false },
                    }),
                ).toBeNull();
                expect(
                    await loaded.contextMatchFn({ ...MATCH_INPUT, codeBasePath: { path: 'src/foo.bar.js', isDir: false } }),
                ).toEqual({ contextName: 'src-foo-bar', filePathVariableName: 'FILE' });
            } else {
                expect(source).toMatch(/endsWith\("\.ts"\)/);
                expect(source).toMatch(/node_modules/);
            }

            expect(confirms.some((c) => isAuthoringPkgConfirm(c.message) && c.defaultValue === true)).toBe(true);
            expect(npmInstallCalls().some((cmd) => !/--save-dev/.test(cmd))).toBe(true);
            const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8')) as {
                name: string;
                private: boolean;
            };
            const project = JSON.parse(
                await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8'),
            ) as { projectName: string };
            expect(pkg).toMatchObject({ name: project.projectName, private: true });
        },
    );

    it('asks for a suffix when no scanned file ends with .js', async () => {
        await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'src', 'app.ts'), 'export {}\n');
        let suffixAsks = 0;
        const result = await runSetup(
            formatPrompter('js', {
                input: async ({ message, defaultValue }) => {
                    if (/suffix|extension/i.test(message)) {
                        suffixAsks += 1;
                        return '.ts';
                    }
                    return defaultValue ?? '';
                },
            }),
        );
        expect(result.success).toBe(true);
        expect(suffixAsks).toBeGreaterThanOrEqual(1);
        const loaded = (await import(pathToFileURL(lumpConfigPath('config.js')).href)).default as GeneratedJsStub;
        expect(await loaded.contextMatchFn({ ...MATCH_INPUT, codeBasePath: { path: 'src/app.js', isDir: false } })).toBeNull();
        expect(await loaded.contextMatchFn({ ...MATCH_INPUT, codeBasePath: { path: 'src/app.ts', isDir: false } })).toEqual({
            contextName: 'src-app',
            filePathVariableName: 'FILE',
        });
    });

    it('warns and continues when authoring-pkg npm install fails', async () => {
        npmInstallOk = false;
        await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'src', 'hello.js'), 'export {}\n');
        await fs.writeFile(path.join(projectRoot, 'src', 'hello.ts'), 'export {}\n');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await runSetup(formatPrompter('ts'));
        expect(result.success).toBe(true);
        expect(await fs.access(lumpConfigPath('config.ts')).then(() => true)).toBe(true);
        const text = `${result.success ? result.data.messages.join('\n') : ''}\n${warnSpy.mock.calls.map((c) => String(c[0])).join('\n')}`;
        expect(text).toMatch(/npm|cli-utils|recipes/i);
    });

    it('does not npm install authoring packages on JSON format', async () => {
        const pkgPath = path.join(projectRoot, 'package.json');
        await fs.writeFile(
            pkgPath,
            `${JSON.stringify({ name: 'already', private: true, dependencies: { leftpad: '1.0.0' } }, null, 2)}\n`,
        );
        const confirms: string[] = [];
        const result = await runSetup(
            formatPrompter('json', {
                confirm: async ({ message, defaultValue }) => {
                    confirms.push(message);
                    return defaultValue;
                },
            }),
        );
        expect(result.success).toBe(true);
        expect(npmInstallCalls()).toHaveLength(0);
        expect(confirms.some(isAuthoringPkgConfirm)).toBe(false);
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8')) as { dependencies: Record<string, string> };
        expect(pkg.dependencies).toEqual({ leftpad: '1.0.0' });
        expect(await fs.access(lumpConfigPath('config.json')).then(() => true)).toBe(true);
        expect(await fs.access(lumpConfigPath('config.js')).then(() => true, () => false)).toBe(false);
        expect(await fs.access(lumpConfigPath('config.ts')).then(() => true, () => false)).toBe(false);
    });

    it('skips the stub write when a lump config already exists', async () => {
        const existing = {
            contextListJson: [README_CONTEXT],
            prompt: { promptTemplate: 'clean and improve the code in @{FILE}', command: 'cursor' },
        };
        await fs.mkdir(path.dirname(lumpConfigPath('config.json')), { recursive: true });
        await fs.writeFile(path.join(projectRoot, '.lumpcode', 'project.json'), `${JSON.stringify({ projectName: 'already', primaryBranch: 'main' }, null, 2)}\n`);
        await fs.writeFile(
            path.join(projectRoot, '.lumpcode', 'local.json'),
            `${JSON.stringify({ mode: 'shared', primaryBranch: 'main' }, null, 2)}\n`,
        );
        await fs.writeFile(lumpConfigPath('config.json'), `${JSON.stringify(existing, null, 2)}\n`);

        await runSetup(formatPrompter('ts'));
        expect(await fs.access(lumpConfigPath('config.ts')).then(() => true, () => false)).toBe(false);
        expect(await fs.access(lumpConfigPath('config.js')).then(() => true, () => false)).toBe(false);
        expect(JSON.parse(await fs.readFile(lumpConfigPath('config.json'), 'utf-8'))).toMatchObject(existing);
        expect(npmInstallCalls()).toHaveLength(0);
    });
});
