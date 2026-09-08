import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import {
    DEFAULT_LUMP_NAME,
    SETUP_PROMPT,
    lumpConfigPath,
    makeSetupHandler,
    planContextsSuccess,
    readJson,
    runLumpSuccess,
    scriptedPrompter,
    setupSetupTestRepo,
    sharedJsonHappyPathPrompter,
    teardownSetupTestRepo,
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

function formatPrompter(format: 'json' | 'js' | 'ts', extra?: Parameters<typeof scriptedPrompter>[0]) {
    return sharedJsonHappyPathPrompter({
        ...extra,
        select: (input) => {
            if (/mode/i.test(input.message)) return 'shared';
            if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
            if (/format|json|javascript|typescript|\bjs\b|\bts\b/i.test(input.message)) return format;
            if (/commit|push/i.test(input.message)) return 'cli';
            return extra?.select?.(input) ?? input.choices[0]!.value;
        },
    });
}

describe.skip('setup command stubs (lumpcode-setup)', () => {
    let project: SetupTestProject;

    beforeEach(async () => {
        project = await setupSetupTestRepo({ tmpPrefix: 'lump-setup-stubs' });
        await writeGlobalCommandModule(project.homeDir, 'my-agent');
        vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
            planContextsSuccess({ projectRoot: project.projectRoot }),
        );
        vi.mocked(runLumpFromLumpNameModule.runLumpFromLumpName).mockResolvedValue(runLumpSuccess());
    });

    afterEach(async () => {
        await teardownSetupTestRepo(project);
        vi.clearAllMocks();
    });

    it('JSON stub uses exact-path README.md when that file exists', async () => {
        const result = await makeSetupHandler({ prompter: formatPrompter('json') })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        const stub = await readJson(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')) as {
            contextListJson: { FILE: string };
            prompt: { promptTemplate: string; command: string };
            baseBranch?: unknown;
        };
        expect(stub.contextListJson).toEqual({ FILE: 'README.md' });
        expect(stub.prompt.promptTemplate).toBe(SETUP_PROMPT);
        expect(stub.prompt.command).toBe('my-agent');
        expect(stub.baseBranch).toBeUndefined();
    });

    it('JSON stub asks for an existing file when README.md is missing', async () => {
        await fs.rm(path.join(project.projectRoot, 'README.md'));
        await fs.mkdir(path.join(project.projectRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(project.projectRoot, 'src', 'app.ts'), 'export {}\n', 'utf-8');

        const prompter = formatPrompter('json', {
            input: (input) => {
                if (/file|path|readme/i.test(input.message)) return 'src/app.ts';
                if (/command|tag|agent/i.test(input.message)) return 'my-agent';
                if (/lump/i.test(input.message)) return DEFAULT_LUMP_NAME;
                return input.defaultValue ?? '';
            },
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        const stub = await readJson(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')) as {
            contextListJson: { FILE: string };
        };
        expect(stub.contextListJson.FILE).toBe('src/app.ts');
        expect(prompter.calls.some((c) => c.kind === 'input' && /file|path/i.test(c.message))).toBe(true);
    });

    it('refuses a JSON file whose exact-path context name is illegal', async () => {
        await fs.writeFile(path.join(project.projectRoot, 'my file.md'), '# no\n', 'utf-8');
        const prompter = formatPrompter('json', {
            input: (() => {
                let fileTries = 0;
                return (input: { message: string; defaultValue?: string }) => {
                    if (/file|path|readme/i.test(input.message)) {
                        fileTries += 1;
                        return fileTries === 1 ? 'my file.md' : 'README.md';
                    }
                    if (/command|tag|agent/i.test(input.message)) return 'my-agent';
                    if (/lump/i.test(input.message)) return DEFAULT_LUMP_NAME;
                    return input.defaultValue ?? '';
                };
            })(),
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        const stub = await readJson(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')) as {
            contextListJson: { FILE: string };
        };
        expect(stub.contextListJson.FILE).toBe('README.md');
        const fileInputs = prompter.calls.filter((c) => c.kind === 'input' && /file|path/i.test(c.message));
        expect(fileInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects an invalid lump name and asks again (default myFirstLump stays available)', async () => {
        const prompter = formatPrompter('json', {
            input: (() => {
                let lumpTries = 0;
                return (input: { message: string; defaultValue?: string }) => {
                    if (/lump/i.test(input.message)) {
                        lumpTries += 1;
                        expect(input.defaultValue).toBe(DEFAULT_LUMP_NAME);
                        return lumpTries === 1 ? 'bad/name' : 'secondLump';
                    }
                    if (/command|tag|agent/i.test(input.message)) return 'my-agent';
                    return input.defaultValue ?? '';
                };
            })(),
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        await expect(fs.access(lumpConfigPath(project.projectRoot, 'secondLump', 'json')))
            .resolves.toBeUndefined();
        expect(result.data.data?.lumpName).toBe('secondLump');
        expect(prompter.calls.filter((c) => c.kind === 'input' && /lump/i.test(c.message)).length)
            .toBeGreaterThanOrEqual(2);
    });

    it.each(['js', 'ts'] as const)('%s stub uses contextMatchFn and an in-file contextNameFromPath', async (format) => {
        await fs.mkdir(path.join(project.projectRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(project.projectRoot, 'src', 'ok.js'), 'export {}\n', 'utf-8');

        const prompter = formatPrompter(format, {
            confirm: (input) => {
                if (/skill/i.test(input.message)) return false;
                if (/cli-utils|recipes|npm install|authoring/i.test(input.message)) {
                    expect(input.defaultValue).toBe(true);
                    return false;
                }
                if (/run/i.test(input.message)) return true;
                return input.defaultValue;
            },
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);

        const body = await fs.readFile(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, format), 'utf-8');
        expect(body).toContain('contextMatchFn');
        expect(body).toContain('function contextNameFromPath');
        expect(body).toContain(SETUP_PROMPT);
        expect(body).toContain("filePathVariableName: 'FILE'");
        expect(body).toMatch(/endsWith\(['"]\.js['"]\)/);
        expect(body).not.toContain('baseBranch');
        expect(body).not.toContain('defineConfig');
        expect(body).not.toContain('@lumpcode/recipes');
        expect(body).not.toContain('@lumpcode/cli-utils');
        expect(body).not.toContain('src/{NAME}');
    });

    it('asks for another suffix when no scanned file ends with .js', async () => {
        await fs.mkdir(path.join(project.projectRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(project.projectRoot, 'src', 'only.ts'), 'export {}\n', 'utf-8');

        const prompter = formatPrompter('ts', {
            confirm: (input) => {
                if (/skill|authoring|cli-utils|recipes|npm install/i.test(input.message)) return false;
                if (/run/i.test(input.message)) return true;
                return input.defaultValue;
            },
            input: (input) => {
                if (/suffix|extension/i.test(input.message)) return '.ts';
                if (/command|tag|agent/i.test(input.message)) return 'my-agent';
                if (/lump/i.test(input.message)) return DEFAULT_LUMP_NAME;
                return input.defaultValue ?? '';
            },
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        expect(prompter.calls.some((c) => c.kind === 'input' && /suffix|extension/i.test(c.message))).toBe(true);
        const body = await fs.readFile(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'ts'), 'utf-8');
        expect(body).toMatch(/endsWith\(['"]\.ts['"]\)/);
    });

    it('authoring-pkg install default is yes for js/ts; failure warns and continues', async () => {
        const { writeFakeBinaries } = await import('./testHelpers');
        const binDir = path.join(project.homeDir, 'bin');
        await writeFakeBinaries(
            binDir,
            ['npm'],
            process.platform === 'win32' ? '@echo off\r\nexit /b 1\r\n' : '#!/bin/sh\nexit 1\n',
        );
        await fs.writeFile(path.join(project.projectRoot, 'ok.js'), 'export {}\n', 'utf-8');

        const prompter = formatPrompter('js', {
            confirm: (input) => {
                if (/skill/i.test(input.message)) return false;
                if (/cli-utils|recipes|npm install|authoring/i.test(input.message)) {
                    expect(input.defaultValue).toBe(true);
                    return true;
                }
                if (/run/i.test(input.message)) return true;
                return input.defaultValue;
            },
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages.join('\n')).toMatch(/cli-utils|recipes|npm/i);
        await expect(fs.access(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'js')))
            .resolves.toBeUndefined();
    });

    it('does not write authoring packages into package.json on the JSON path', async () => {
        await fs.writeFile(
            path.join(project.projectRoot, 'package.json'),
            JSON.stringify({ name: 'app', private: true }),
            'utf-8',
        );
        const result = await makeSetupHandler({ prompter: formatPrompter('json') })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        const pkg = await readJson(path.join(project.projectRoot, 'package.json')) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        expect(pkg.dependencies?.['@lumpcode/cli-utils']).toBeUndefined();
        expect(pkg.dependencies?.['@lumpcode/recipes']).toBeUndefined();
        expect(pkg.devDependencies?.['@lumpcode/cli-utils']).toBeUndefined();
        expect(pkg.devDependencies?.['@lumpcode/recipes']).toBeUndefined();
    });
});
