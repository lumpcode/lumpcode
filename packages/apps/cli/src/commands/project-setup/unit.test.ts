import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { command } from './main';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('project-setup command', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-setup-'));
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    function makeHandler() {
        return command.handlerMaker({});
    }

    it('creates .lumpcode layout, project.json and local.json with explicit projectName', async () => {
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: { projectName: 'my-app' },
                arguments: {},
            });

            expect(result.success).toBe(true);

            const raw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8');
            const json = JSON.parse(raw) as { projectName: string };
            expect(json.projectName).toBe('my-app');
            await Promise.all([
                fs.access(path.join(projectRoot, '.lumpcode', 'lumps')),
                fs.access(path.join(projectRoot, '.lumpcode', 'commands')),
            ]);

            const localRaw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8');
            const local = JSON.parse(localRaw) as {
                mode: string;
                discoveryBranch: string;
                workspaceStrategy: string;
            };
            expect(local).toEqual({
                mode: 'shared',
                discoveryBranch: 'main',
                workspaceStrategy: 'checkout',
            });

            const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
            expect(gitignore).toContain('.lumpcode/**/contextStatusRecord.json');
            expect(gitignore).toContain('.lumpcode/**/history/');
            expect(gitignore).toContain('.lumpcode/worktrees/');
            expect(gitignore).toContain('.lumpcode/local.json');
            expect(gitignore).toContain('.lumpcode/.cache/');
        } finally {
            process.chdir(prev);
        }
    });

    it('honors --mode and --discoveryBranch when scaffolding local.json', async () => {
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: { projectName: 'my-app', mode: 'dedicated', discoveryBranch: 'develop' },
                arguments: {},
            });
            expect(result.success).toBe(true);

            const localRaw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8');
            const local = JSON.parse(localRaw) as { mode: string; discoveryBranch: string };
            expect(local).toEqual({
                mode: 'dedicated',
                discoveryBranch: 'develop',
                workspaceStrategy: 'checkout',
            });
        } finally {
            process.chdir(prev);
        }
    });

    it('derives projectName from origin remote when projectName is omitted', async () => {
        const bareDireBaseName = 'lump-project-setup-bare-';
        const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), bareDireBaseName));

        git('init --bare', bareDir);
        git(`remote add origin ${bareDir}`, projectRoot);
        git('push -u origin main', projectRoot);

        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: {},
                arguments: {},
            });
            expect(result.success).toBe(true);

            const raw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf-8');
            const json = JSON.parse(raw) as { projectName: string };
            expect(json.projectName).toBe(path.basename(bareDir));
        } finally {
            process.chdir(prev);
            await fs.rm(bareDir, { recursive: true, force: true });
        }
    });

    it('fails when the directory is not a git repository', async () => {
        const nonGit = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-setup-nogit-'));
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(nonGit);
        try {
            const result = await handle({
                options: {},
                arguments: {},
            });
            expect(result.success).toBe(false);
        } finally {
            process.chdir(prev);
            await fs.rm(nonGit, { recursive: true, force: true });
        }
    });

    it('fails when .lumpcode already exists', async () => {
        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: { projectName: 'x' },
                arguments: {},
            });
            expect(result.success).toBe(false);
        } finally {
            process.chdir(prev);
        }
    });

    it('fails when explicit projectName has invalid characters', async () => {
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: { projectName: 'bad name' },
                arguments: {},
            });
            expect(result.success).toBe(false);
        } finally {
            process.chdir(prev);
        }
    });

    it('sanitizes inferred projectName from directory basename when origin is absent', async () => {
        const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-setup-parent-'));
        const nestedRoot = path.join(parent, 'my silly app');
        await fs.mkdir(nestedRoot, { recursive: true });
        git('init -b main', nestedRoot);
        git('config user.email "test@test.com"', nestedRoot);
        git('config user.name "Test"', nestedRoot);
        git('commit --allow-empty -m "init"', nestedRoot);

        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(nestedRoot);
        try {
            const result = await handle({ options: {}, arguments: {} });
            expect(result.success).toBe(true);
            const raw = await fs.readFile(path.join(nestedRoot, '.lumpcode', 'project.json'), 'utf-8');
            const json = JSON.parse(raw) as { projectName: string };
            expect(json.projectName).toBe('my-silly-app');
        } finally {
            process.chdir(prev);
            await fs.rm(parent, { recursive: true, force: true });
        }
    });

    it('does not duplicate contextStatusRecord.json ignore line when already in .gitignore', async () => {
        await fs.writeFile(
            path.join(projectRoot, '.gitignore'),
            '.lumpcode/**/contextStatusRecord.json\n',
            'utf-8',
        );
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: { projectName: 'dup-test' },
                arguments: {},
            });
            expect(result.success).toBe(true);

            const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
            expect(gitignore.match(/\.lumpcode\/\*\*\/contextStatusRecord\.json/g)?.length).toBe(1);
        } finally {
            process.chdir(prev);
        }
    });

    it('does not duplicate .lumpcode/.cache/ when already in gitignore', async () => {
        await fs.writeFile(
            path.join(projectRoot, '.gitignore'),
            '.lumpcode/.cache/\n',
            'utf-8',
        );
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const first = await handle({
                options: { projectName: 'cache-dup-test' },
                arguments: {},
            });
            expect(first.success).toBe(true);

            const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
            expect(gitignore.match(/\.lumpcode\/\.cache\//g)?.length).toBe(1);
        } finally {
            process.chdir(prev);
        }
    });
});
