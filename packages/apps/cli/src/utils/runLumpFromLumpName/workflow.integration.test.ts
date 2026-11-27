import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { noopLogger } from '../noopLogger';
import { execGit } from '../execGit';
import { getGitCommitMessage } from '../getGitCommitMessage';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';
import { lumpBranchName } from '../lumpBranchName';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { writeJsonFile } from '../writeJsonFile';
import { runLumpFromJsConfigFailureMessage } from '../runLumpFromJsConfig';
import { runLumpFromLumpName } from './main';

describe.skip('workflow config run', () => {
    it('pushes a branch and gives teardown one ContextResult per context', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-workflow-run-' });
        const { projectRoot, remoteDir, localConfigFolderPath, globalConfigFolderPath } = dirs;
        const lumpName = 'wf-lump';
        const hookOut = path.join(os.tmpdir(), `lump-workflow-hook-${path.basename(projectRoot)}`);
        const lumpDir = path.join(localConfigFolderPath, 'lumps', lumpName);
        try {
            await fs.mkdir(lumpDir, { recursive: true });
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'local.json'),
                data: { mode: 'dedicated', primaryBranch: 'main' },
            });
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'project.json'),
                data: { projectName: 'workflow-run-test' },
            });
            await fs.writeFile(
                path.join(lumpDir, 'config.ts'),
                `import { writeFileSync } from 'node:fs';

const hookOut = ${JSON.stringify(hookOut)};

export default {
  getContextListFn: () => [
    { name: 'one', variables: {} },
    { name: 'two', variables: {} },
  ],
  numberOfContextsPerBranch: 2,
  async workflow({ context, shell }) {
    const ran = await shell('echo ' + context.name);
    if (!ran.succeeded) {
      return { succeeded: false, push: false, message: ran.output };
    }
    return { message: context.name };
  },
  postSetupWorkspaceFn(input) {
    writeFileSync(hookOut + '.setup', JSON.stringify(input.contextResults ?? null));
  },
  postTeardownWorkspaceFn(input) {
    writeFileSync(hookOut, JSON.stringify(input.contextResults ?? null));
  },
};
`,
                'utf-8',
            );
            initBareRemoteAndCheckout({ projectRoot, remoteDir: remoteDir! });

            const result = await runLumpFromLumpName({
                lumpName,
                localConfigFolderPath,
                globalConfigFolderPath: globalConfigFolderPath!,
                sourceProjectRoot: projectRoot,
                logger: noopLogger,
            });
            expect(result.success, result.success ? '' : runLumpFromJsConfigFailureMessage(result.data)).toBe(true);
            if (!result.success) return;
            expect(result.data.skipped).toBe(false);
            if (result.data.skipped) throw new Error('unreachable');
            expect(result.data.result.contextNames).toEqual(['one', 'two']);

            const branch = lumpBranchName({
                lumpName,
                contextList: [{ name: 'one' }, { name: 'two' }],
            });
            expect(execGit('show-ref --verify --quiet refs/heads/' + branch, remoteDir!)).toBe('');
            const subjects = execGit(`log ${branch} --format=%s`, remoteDir!).split('\n');
            expect(subjects).toContain(getGitCommitMessage({ lumpName, contextName: 'one' }));
            expect(subjects).toContain(getGitCommitMessage({ lumpName, contextName: 'two' }));

            const setup = JSON.parse(await fs.readFile(hookOut + '.setup', 'utf8')) as unknown;
            const teardown = JSON.parse(await fs.readFile(hookOut, 'utf8')) as Array<{
                outcome: string;
                context: { name: string };
                result: { message?: string; succeeded: boolean; push: boolean };
            }>;
            expect(setup).toEqual([]);
            expect(teardown.map((entry) => entry.context.name)).toEqual(['one', 'two']);
            expect(teardown.map((entry) => entry.outcome)).toEqual(['pushed', 'pushed']);
            expect(teardown.map((entry) => entry.result.message)).toEqual(['one', 'two']);
            expect(teardown.every((entry) => entry.result.succeeded && entry.result.push)).toBe(true);
        } finally {
            await fs.rm(hookOut, { force: true });
            await fs.rm(hookOut + '.setup', { force: true });
            await removeTempTestDirs(dirs);
        }
    });
});
