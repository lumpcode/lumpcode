import { execSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
    defaultGitAddCommitFn,
    defaultGitCommitMessageFn,
    defaultGitPushFn,
    runLump,
    shellSingleQuote,
} from '@lumpcode/core';

import { featureBacklog } from './workflowRecipe';

const REQ_RELATIVE = '.lumpcode/lumps/ship/backlogItems/todo/alpha/requirements.md';

// Skipped until the impl stage runs the workflow recipe. Unskip; do not rewrite.
describe('featureBacklog workflow run', () => {
    let projectRoot: string;
    let remoteDir: string;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
        }
        if (remoteDir) {
            await rm(remoteDir, { recursive: true, force: true });
        }
    });

    it('pushes a req context once the requirements file is written', async () => {
        await scaffold({ withRequirements: false });
        const { result, branch } = await runRecipe({
            prompts: { req: 'Write the requirements document.' },
        });

        expect(result.success, result.success ? '' : result.data.message).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults?.[0]).toMatchObject({
            context: { name: 'alpha_req' },
            outcome: 'pushed',
            result: {
                succeeded: true,
                push: true,
                message: `Wrote ${REQ_RELATIVE}.`,
            },
        });
        const shown = execSync(`git show ${branch}:${REQ_RELATIVE}`, {
            cwd: projectRoot,
            encoding: 'utf-8',
        });
        expect(shown).toContain('# Requirements');
    });

    it('pushes a red impl with succeeded false', async () => {
        await scaffold({ withRequirements: true });
        const { result } = await runRecipe({
            prompts: { impl: 'Implement the ticket' },
            implValidateCommand: 'exit 1',
        });

        expect(result.success, result.success ? '' : result.data.message).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults?.[0]).toMatchObject({
            context: { name: 'alpha' },
            outcome: 'pushed',
            result: {
                succeeded: false,
                push: true,
                message: 'Tests still red after 3 attempts.',
            },
        });
    });

    async function scaffold({ withRequirements }: { withRequirements: boolean }) {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-run-'));
        remoteDir = await mkdtemp(path.join(tmpdir(), 'feature-backlog-remote-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'ship');
        const itemDir = path.join(lumpPath, 'backlogItems', 'todo', 'alpha');
        await mkdir(itemDir, { recursive: true });
        await writeFile(path.join(lumpPath, 'config.ts'), 'export default {};\n');
        await writeFile(
            path.join(itemDir, 'desc.yml'),
            'name: alpha\ntask: Alpha\npriority: 1\nstages:\n  - req\n  - impl\n',
        );
        if (withRequirements) {
            await writeFile(path.join(projectRoot, REQ_RELATIVE), '# Requirements\n');
        }
        git('git init -b dev');
        git('git config user.email "test@test.com"');
        git('git config user.name "Test"');
        git('git add .');
        git('git commit -m "init"');
        git(`git init --bare ${shellSingleQuote(remoteDir)}`);
        git(`git remote add origin ${shellSingleQuote(remoteDir)}`);
        git('git push -u origin dev');
    }

    async function runRecipe(options: {
        prompts: { req?: string; impl?: string };
        implValidateCommand?: string;
    }) {
        let branch = '';
        const config = featureBacklog({
            configUrl: pathToFileURL(path.join(projectRoot, '.lumpcode', 'lumps', 'ship', 'config.ts')),
            prompts: options.prompts,
            implValidateCommand: options.implValidateCommand,
        });
        if (typeof config.getContextListFn !== 'function' || typeof config.workflow !== 'function') {
            throw new Error('expected workflow recipe config');
        }
        const list = config.getContextListFn;
        const workflow = config.workflow;
        const result = await runLump({
            projectRoot,
            baseBranch: 'dev',
            branchFn: async ({ contextList }) => {
                branch = `lump/ship/${contextList.map((context) => context.name).join('-')}`;
                return branch;
            },
            getContextListFn: (input) => list({ ...input, discoveryBranch: 'dev' }),
            workflow,
            createAgent: () => ({
                async session() {
                    return {
                        command: 'test-agent',
                        sessionId: 's1',
                        prompt: async (text: string) => {
                            if (text.toLowerCase().includes('requirement')) {
                                await mkdir(path.dirname(path.join(projectRoot, REQ_RELATIVE)), { recursive: true });
                                await writeFile(path.join(projectRoot, REQ_RELATIVE), '# Requirements\n');
                            }
                            return { output: text, succeeded: true, exitCode: 0, timedOut: false };
                        },
                    };
                },
                async prompt() {
                    throw new Error('workflow should open a session');
                },
            }),
            gitAddCommitFn: defaultGitAddCommitFn,
            gitCommitMessageFn: defaultGitCommitMessageFn,
            gitPushFn: defaultGitPushFn,
            setupWorkspaceFn: async ({ branchName }) => ({
                command: `git switch -C ${shellSingleQuote(branchName)}`,
                workspacePath: projectRoot,
            }),
            teardownWorkspaceFn: async () => 'git switch dev',
            getKeepHistoryFilePathFn: () => undefined,
        });
        return { result, branch };
    }

    function git(command: string) {
        execSync(command, { cwd: projectRoot, stdio: 'pipe' });
    }
});
