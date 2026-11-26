import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(repoRoot, '.lumpcode/templates/main.ts');
const roots = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

function tempRoot(prefix) {
    const root = mkdtempSync(join(tmpdir(), prefix));
    const rel = relative(resolve(tmpdir()), resolve(root));
    if (rel.startsWith('..') || rel === '') {
        throw new Error(`refusing to use a path outside os.tmpdir(): ${root}`);
    }
    roots.push(root);
    return root;
}

function write(path, contents) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
}

function git(cwd, args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function loadTemplate() {
    const dir = tempRoot('lump-repo-template-bundle-');
    const outfile = join(dir, 'defineLump.mjs');
    await build({
        absWorkingDir: repoRoot,
        bundle: true,
        entryPoints: [templatePath],
        format: 'esm',
        packages: 'external',
        platform: 'node',
        target: 'node22',
        outfile,
    });
    return import(pathToFileURL(outfile).href);
}

function hookInput(projectRoot, workspacePath, workspaceStrategy) {
    return {
        baseBranch: 'dev',
        branchName: 'lump/backlog/example',
        contextList: [],
        workspacePath,
        executionWorkspacePath: projectRoot,
        workspaceStrategy,
        projectRoot,
        lumpVariables: {},
    };
}

describe('defineLump', () => {
    it('injects cursor, grok-4.7-high, worktree preparation, and GitHub PR opening', async () => {
        const { defineLump } = await loadTemplate();
        const source = readFileSync(templatePath, 'utf8');
        expect(source).toContain("const COMMAND = 'cursor'");
        expect(source).toContain("const MODEL = 'grok-4.7-high'");
        expect(source).toContain("const INSTALL_COMMAND: string = 'npm ci'");
        expect(source).toContain('const OPEN_PR = true');
        expect(source).toContain("openPrPostTeardown({ provider: 'github' })");

        const config = defineLump({ prompt: { promptTemplate: 'Hi.' } });
        expect(config.command).toBe('cursor');
        expect(config.lumpVariables).toEqual({ model: 'grok-4.7-high' });
        expect(config.steps).toBeUndefined();
        expect(config.postSetupWorkspaceFn).toEqual(expect.any(Function));
        expect(config.postTeardownWorkspaceFn).toEqual(expect.any(Function));
        await expect(config.postTeardownWorkspaceFn({
            baseBranch: 'dev',
            branchName: 'dev',
            contextList: [],
            workspacePath: repoRoot,
        })).resolves.toBeUndefined();
    });

    it('lets a caller replace command, model, and workspace hooks', async () => {
        const { defineLump } = await loadTemplate();
        const customSetup = () => undefined;
        const customTeardown = () => undefined;
        const withFns = defineLump({
            command: 'copilot',
            lumpVariables: { model: 'other', outputDetail: 'quiet' },
            postSetupWorkspaceFn: customSetup,
            postTeardownWorkspaceFn: customTeardown,
        });
        expect(withFns.command).toBe('copilot');
        expect(withFns.lumpVariables).toEqual({ model: 'other', outputDetail: 'quiet' });
        expect(withFns.postSetupWorkspaceFn).toBe(customSetup);
        expect(withFns.postTeardownWorkspaceFn).toBe(customTeardown);

        const partial = defineLump({ lumpVariables: { outputDetail: 'quiet' } });
        expect(partial.lumpVariables).toEqual({ model: 'grok-4.7-high', outputDetail: 'quiet' });

        const withCommands = defineLump({
            postSetupWorkspaceCommand: 'npm ci',
            postTeardownWorkspaceCommand: 'echo done',
        });
        expect(withCommands.postSetupWorkspaceFn).toBeUndefined();
        expect(withCommands.postTeardownWorkspaceFn).toBeUndefined();
        expect(withCommands.postSetupWorkspaceCommand).toBe('npm ci');
        expect(withCommands.postTeardownWorkspaceCommand).toBe('echo done');
    });

    it('copies env files on worktree and returns npm ci, and does nothing otherwise', async () => {
        const { defineLump } = await loadTemplate();
        const projectRoot = tempRoot('lump-repo-template-root-');
        const workspacePath = tempRoot('lump-repo-template-wt-');
        write(join(projectRoot, '.env'), 'ROOT=1\n');
        write(join(projectRoot, '.env.backup'), 'backup=1\n');
        write(join(projectRoot, 'config/.env.production'), 'prod=1\n');
        write(join(projectRoot, 'notes.env'), 'nope\n');
        write(join(projectRoot, '.environment'), 'nope\n');
        write(join(projectRoot, 'node_modules/.env'), 'skip\n');
        write(join(projectRoot, '.git/.env'), 'skip\n');
        write(join(projectRoot, '.worktrees/foo/.env'), 'skip\n');
        write(join(projectRoot, '.lumpcode/.env'), 'skip\n');
        write(join(workspacePath, 'src/.env.local'), 'keep\n');
        write(join(projectRoot, 'src/.env.local'), 'replace-me\n');

        git(projectRoot, ['init', '-b', 'main']);
        git(projectRoot, ['config', 'user.email', 'test@example.com']);
        git(projectRoot, ['config', 'user.name', 'Test']);
        git(projectRoot, ['add', '.env']);
        git(projectRoot, ['commit', '-m', 'env']);
        const head = git(projectRoot, ['rev-parse', 'HEAD']);
        const status = git(projectRoot, ['status', '--porcelain']);

        const prepare = defineLump({}).postSetupWorkspaceFn;
        const prepared = await prepare(hookInput(projectRoot, workspacePath, 'worktree'));
        expect(prepared).toEqual({ command: 'npm ci' });
        expect(readFileSync(join(workspacePath, '.env'), 'utf8')).toBe('ROOT=1\n');
        expect(readFileSync(join(workspacePath, '.env.backup'), 'utf8')).toBe('backup=1\n');
        expect(readFileSync(join(workspacePath, 'config/.env.production'), 'utf8')).toBe('prod=1\n');
        expect(readFileSync(join(workspacePath, 'src/.env.local'), 'utf8')).toBe('keep\n');
        expect(existsSync(join(workspacePath, 'notes.env'))).toBe(false);
        expect(existsSync(join(workspacePath, '.environment'))).toBe(false);
        expect(existsSync(join(workspacePath, 'node_modules/.env'))).toBe(false);
        expect(existsSync(join(workspacePath, '.git/.env'))).toBe(false);
        expect(existsSync(join(workspacePath, '.worktrees/foo/.env'))).toBe(false);
        expect(existsSync(join(workspacePath, '.lumpcode/.env'))).toBe(false);
        expect(git(projectRoot, ['status', '--porcelain'])).toBe(status);
        expect(git(projectRoot, ['rev-parse', 'HEAD'])).toBe(head);

        const checkoutPath = tempRoot('lump-repo-template-checkout-');
        const skipped = await prepare(hookInput(projectRoot, checkoutPath, 'checkout'));
        expect(skipped).toBeUndefined();
        expect(existsSync(join(checkoutPath, '.env'))).toBe(false);
        expect(git(projectRoot, ['rev-parse', 'HEAD'])).toBe(head);
    });
});

describe('lane configs', () => {
    it('wraps the four lanes without restating command, model, or the PR hook', () => {
        const lanes = {
            backlog: {
                recipe: 'featureBacklog',
                concurrency: 3,
                learnings: true,
                timeout: true,
            },
            qol: { recipe: 'featureBacklog', concurrency: 2, learnings: true, timeout: false },
            bugfixes: { recipe: 'featureBacklog', concurrency: 2, learnings: true, timeout: false },
            docs: { recipe: 'backlog', concurrency: 2, learnings: false, timeout: false },
        };
        for (const [name, expectLane] of Object.entries(lanes)) {
            const source = readFileSync(join(repoRoot, '.lumpcode/lumps', name, 'config.ts'), 'utf8');
            expect(source, name).toContain(`defineLump(${expectLane.recipe}`);
            expect(source, name).toContain("from '../../templates/main'");
            expect(source, name).not.toContain('openPrPostTeardown');
            expect(source, name).not.toContain("command: 'cursor'");
            expect(source, name).not.toContain('lumpVariables');
            expect(source, name).not.toContain('postTeardownWorkspaceFn');
            expect(source, name).toContain(`maximumNumberOfConcurrentBranches: ${expectLane.concurrency}`);
            if (expectLane.learnings) {
                expect(source, name).toContain('learningsPromptFns');
            } else {
                expect(source, name).not.toContain('learningsPromptFns');
            }
            if (expectLane.timeout) {
                expect(source, name).toContain('timeoutMillis: 1000 * 60 * 60 * 4');
            } else {
                expect(source, name).not.toContain('timeoutMillis');
            }
        }

        const backlog = readFileSync(join(repoRoot, '.lumpcode/lumps/backlog/config.ts'), 'utf8');
        expect(backlog).toContain('withExpectMatch(defaultTestImplPrompt, input)');
        expect(backlog).toContain('withExpectMatch(defaultImplPrompt, input)');
        expect(backlog).toContain("'npm run build -w=@lumpcode/cli'");
        expect(backlog).toContain("'npm run test -w=@lumpcode/cli'");

        const docs = readFileSync(join(repoRoot, '.lumpcode/lumps/docs/config.ts'), 'utf8');
        expect(docs).toContain("baseBranch: 'dev'");
        expect(docs).toContain("discoveryBranch: 'dev'");
        expect(docs).toContain('return { stage: \'implementation\' }');
        expect(docs).toContain('Update the operator-facing docs, website, or naming for this docs backlog item.');
        expect(docs).not.toContain('implValidateCommand');
    });
});
