import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { command } from './main';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('lump-create command', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-create-'));
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
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
});
