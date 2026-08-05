import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { command } from './main';
import { execGit } from '../../utils/execGit';


describe('project-setup command', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-setup-'));
        execGit('init -b main', projectRoot);
        execGit('config user.email "test@test.com"', projectRoot);
        execGit('config user.name "Test"', projectRoot);
        execGit('commit --allow-empty -m "init"', projectRoot);
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    function makeHandler() {
        return command.handlerMaker({});
    }

    /**
     * Current scaffold (primary + workspaceStrategy on local). Stays green until
     * clean-local-project-json-config S* expectations below are unskipped.
     */
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
                primaryBranch: string;
                workspaceStrategy: string;
            };
            expect(local).toEqual({
                mode: 'shared',
                primaryBranch: 'main',
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

    it('honors --mode and --primaryBranch when scaffolding local.json', async () => {
        const handle = makeHandler();
        const prev = process.cwd();
        process.chdir(projectRoot);
        try {
            const result = await handle({
                options: { projectName: 'my-app', mode: 'dedicated', primaryBranch: 'develop' },
                arguments: {},
            });
            expect(result.success).toBe(true);

            const localRaw = await fs.readFile(path.join(projectRoot, '.lumpcode', 'local.json'), 'utf-8');
            const local = JSON.parse(localRaw) as { mode: string; primaryBranch: string };
            expect(local).toEqual({
                mode: 'dedicated',
                primaryBranch: 'develop',
                workspaceStrategy: 'checkout',
            });
        } finally {
            process.chdir(prev);
        }
    });

    /**
     * clean-local-project-json-config S* — new scaffold: primary on project.json; local mode-only.
     */
    describe.skip('project-setup scaffold (clean-local-project-json-config S*)', () => {
        it('S1: default scaffold writes projectName+primaryBranch on project; mode-only local', async () => {
            const handle = makeHandler();
            const prev = process.cwd();
            process.chdir(projectRoot);
            try {
                const result = await handle({
                    options: { projectName: 'my-app' },
                    arguments: {},
                });
                expect(result.success).toBe(true);

                const projectRaw = await fs.readFile(
                    path.join(projectRoot, '.lumpcode', 'project.json'),
                    'utf-8',
                );
                expect(JSON.parse(projectRaw)).toEqual({
                    projectName: 'my-app',
                    primaryBranch: 'main',
                });

                const localRaw = await fs.readFile(
                    path.join(projectRoot, '.lumpcode', 'local.json'),
                    'utf-8',
                );
                expect(JSON.parse(localRaw)).toEqual({ mode: 'shared' });

                const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8');
                expect(gitignore).toContain('.lumpcode/local.json');
            } finally {
                process.chdir(prev);
            }
        });

        it('S2: --mode dedicated + --primaryBranch develop', async () => {
            const handle = makeHandler();
            const prev = process.cwd();
            process.chdir(projectRoot);
            try {
                const result = await handle({
                    options: {
                        projectName: 'my-app',
                        mode: 'dedicated',
                        primaryBranch: 'develop',
                    },
                    arguments: {},
                });
                expect(result.success).toBe(true);

                const projectRaw = await fs.readFile(
                    path.join(projectRoot, '.lumpcode', 'project.json'),
                    'utf-8',
                );
                expect(JSON.parse(projectRaw)).toEqual({
                    projectName: 'my-app',
                    primaryBranch: 'develop',
                });

                const localRaw = await fs.readFile(
                    path.join(projectRoot, '.lumpcode', 'local.json'),
                    'utf-8',
                );
                expect(JSON.parse(localRaw)).toEqual({ mode: 'dedicated' });
            } finally {
                process.chdir(prev);
            }
        });
    });

    it('derives projectName from origin remote when projectName is omitted', async () => {
        const bareDireBaseName = 'lump-project-setup-bare-';
        const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), bareDireBaseName));

        execGit('init --bare', bareDir);
        execGit(`remote add origin ${bareDir}`, projectRoot);
        execGit('push -u origin main', projectRoot);

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
        execGit('init -b main', nestedRoot);
        execGit('config user.email "test@test.com"', nestedRoot);
        execGit('config user.name "Test"', nestedRoot);
        execGit('commit --allow-empty -m "init"', nestedRoot);

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
