import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { Step } from '@lumpcode/core';

import { command } from './main';
import { initLocalGitRepo } from '../../utils/initLocalGitRepo';
import { getJsConfigFromLumpName } from '../../utils/getJsConfigFromLumpName';
import { jsConfigToRunLumpInput } from '../../utils/jsConfigToRunLumpInput';
import { listBundledPresetCommandNames } from '../../utils/ensurePresetCommandsInstalled';
import type { LumpJsConfig } from '../../types';

const bundlePresetsDir = path.resolve(__dirname, '../../presets/commands');

async function shippedPresetTags(): Promise<string[]> {
    const names = await listBundledPresetCommandNames(bundlePresetsDir);
    return names.map((name) => path.basename(name, '.js'));
}

function commandTagFromPrompt(prompt: LumpJsConfig['prompt']): string {
    if (prompt == null || typeof prompt === 'string' || typeof prompt === 'function') {
        throw new Error('stub prompt has no command tag');
    }
    if (typeof prompt.command !== 'string') {
        throw new Error('stub command is not a tag');
    }
    return prompt.command;
}

describe('lump-create command', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-create-'));
        initLocalGitRepo({ cwd: projectRoot });
        await fs.mkdir(path.join(projectRoot, '.lumpcode', 'lumps'), { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    function makeHandler() {
        return command.handlerMaker({ projectRoot });
    }

    it('creates config.json by default', async () => {
        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: { lumpName: 'add-tests' },
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        const configPath = path.join(projectRoot, '.lumpcode', 'lumps', 'add-tests', 'config.json');
        const raw = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as { baseBranch: string; };
        expect(parsed.baseBranch).toBe('main');
        expect(result.data.data!.configFormat).toBe('json');
        expect(result.data.data!.configPath).toBe(path.join('.lumpcode', 'lumps', 'add-tests', 'config.json'));
    });

    it('creates config.js when --config js', async () => {
        const handle = makeHandler();
        const result = await handle({
            options: { config: 'js' },
            arguments: { lumpName: 'fix-imports' },
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        const configPath = path.join(projectRoot, '.lumpcode', 'lumps', 'fix-imports', 'config.js');
        const raw = await fs.readFile(configPath, 'utf-8');
        expect(raw).toContain("export default");
        expect(raw).toContain("'main'");
        expect(result.data.data!.configFormat).toBe('js');
    });

    it('creates config.ts when --config ts', async () => {
        const handle = makeHandler();
        const result = await handle({
            options: { config: 'ts' },
            arguments: { lumpName: 'typed-lump' },
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        const configPath = path.join(projectRoot, '.lumpcode', 'lumps', 'typed-lump', 'config.ts');
        const raw = await fs.readFile(configPath, 'utf-8');
        expect(raw).toContain('export default');
        expect(raw).toContain("'main'");
        expect(result.data.data!.configFormat).toBe('ts');
        expect(result.data.data!.configPath).toBe(path.join('.lumpcode', 'lumps', 'typed-lump', 'config.ts'));
    });

    it('fails when lump config already exists', async () => {
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'dup');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.json'), '{}\n', 'utf-8');

        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: { lumpName: 'dup' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('already has a config');
    });

    it('fails when config.ts already exists', async () => {
        const lumpDir = path.join(projectRoot, '.lumpcode', 'lumps', 'dup-ts');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(path.join(lumpDir, 'config.ts'), 'export default {};\n', 'utf-8');

        const handle = makeHandler();
        const result = await handle({
            options: { config: 'ts' },
            arguments: { lumpName: 'dup-ts' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('already has a config');
    });

    it('fails when not a Lumpcode project root', async () => {
        const nonProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-create-noproject-'));
        try {
            const handle = command.handlerMaker({ projectRoot: nonProjectDir });
            const result = await handle({
                options: {},
                arguments: { lumpName: 'x' },
            });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await fs.rm(nonProjectDir, { recursive: true, force: true });
        }
    });

    it('fails on invalid lump name', async () => {
        const handle = makeHandler();
        const result = await handle({
            options: {},
            arguments: { lumpName: 'bad/name' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('path separators');
    });

    it('names a shipped preset command tag in every stub format', async () => {
        const tags = await shippedPresetTags();
        expect(tags.length).toBeGreaterThan(0);

        const formats = [
            { config: undefined, lumpName: 'stub-json' },
            { config: 'js' as const, lumpName: 'stub-js' },
            { config: 'ts' as const, lumpName: 'stub-ts' },
        ];

        const handle = makeHandler();
        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');

        for (const format of formats) {
            const result = await handle({
                options: format.config ? { config: format.config } : {},
                arguments: { lumpName: format.lumpName },
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');

            const loaded = await getJsConfigFromLumpName({
                lumpName: format.lumpName,
                localConfigFolderPath,
            });
            expect(loaded.success).toBe(true);
            if (!loaded.success) throw new Error(loaded.data);

            expect(tags).toContain(commandTagFromPrompt(loaded.data.prompt));
        }
    });

    it('loads the json stub command module', async () => {
        const handle = makeHandler();
        const created = await handle({
            options: {},
            arguments: { lumpName: 'comps' },
        });
        expect(created.success).toBe(true);
        if (!created.success) throw new Error('unreachable');

        const localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        const loaded = await getJsConfigFromLumpName({
            lumpName: 'comps',
            localConfigFolderPath,
        });
        expect(loaded.success).toBe(true);
        if (!loaded.success) throw new Error(loaded.data);

        const globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-create-presets-'));
        try {
            const resolved = await jsConfigToRunLumpInput({
                config: loaded.data,
                lumpName: 'comps',
                localConfigFolderPath,
                globalConfigFolderPath,
                projectBaseBranch: 'main',
                executionWorkspacePath: projectRoot,
            });
            expect(resolved.success).toBe(true);
            if (!resolved.success) throw new Error(resolved.data);

            const step = resolved.data.steps[0] as Step;
            expect(typeof step.commandFn).toBe('function');
            expect(step.commandFn.commandName).toBe(commandTagFromPrompt(loaded.data.prompt));
        } finally {
            await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });
});
