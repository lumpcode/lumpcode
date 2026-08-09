import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LUMP_PLAN_UTIL_CONFIG_TS } from '../../testing/tsLumpFixtures';
import { planLumpFromJsConfig } from './main';
import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';
import { writeJsonFile } from '../writeJsonFile';

const FIXTURES_GLOBAL = path.resolve(__dirname, '../jsConfigToRunLumpInput/__fixtures__/global-config');

const LUMP_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

describe('planLumpFromJsConfig', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-util-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        globalConfigFolderPath = FIXTURES_GLOBAL;
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'preview-lump'), { recursive: true });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'local.json'), data: { mode: 'dedicated', primaryBranch: 'main' } });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'project.json'), data: { projectName: 'preview-project' } });

        initLocalGitRepo({ cwd: projectRoot });

        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'preview-lump', 'config.js'),
            LUMP_CONFIG_JS,
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('validate depth returns valid without contexts', async () => {
        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'validate',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.valid).toBe(true);
        expect(result.data.contexts).toBeUndefined();
    });

    it('contexts depth lists resolved contexts', async () => {
        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'contexts',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.contexts?.map((c) => c.name)).toEqual(['ctx1']);
    });

    it('prompts depth includes prompt steps', async () => {
        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'prompts',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.promptsByContext?.ctx1).toHaveLength(1);
        expect(result.data.promptsByContext?.ctx1?.[0].prompt).toBe('preview prompt');
    });

    it('plan depth omits gitCommandsByContext and gitPushCommand', async () => {
        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'plan',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.plan).toBeDefined();
        expect(result.data.plan).not.toHaveProperty('gitCommandsByContext');
        expect(result.data.plan).not.toHaveProperty('gitPushCommand');
        expect(result.data.plan?.branchName).toBeTruthy();
        expect(result.data.plan?.contextNames).toEqual(['ctx1']);
    });

    it('P1 validate depth succeeds with config.ts', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'preview-lump', 'config.ts'),
            LUMP_PLAN_UTIL_CONFIG_TS,
            'utf-8',
        );
        await fs.rm(path.join(localConfigFolderPath, 'lumps', 'preview-lump', 'config.js'));

        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'validate',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.valid).toBe(true);
    });

    it('P2 contexts depth lists contexts from TS getContextListFn file', async () => {
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'preview-lump');
        await fs.writeFile(
            path.join(lumpDir, 'getContextList.ts'),
            `export default function getContextListFn() {
  return [{ name: 'from-ts-file', variables: { FILE: 'ctx.ts' } }];
}`,
            'utf-8',
        );
        await fs.writeFile(
            path.join(lumpDir, 'config.ts'),
            `export default {
  getContextListFn: './getContextList.ts',
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};`,
            'utf-8',
        );
        await fs.rm(path.join(lumpDir, 'config.js'));

        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'contexts',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.contexts?.map((c) => c.name)).toEqual(['from-ts-file']);
    });

    it('fails with allowlist message when discoveryBranch is unlisted (dedicated)', async () => {
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
            },
        });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'preview-lump', 'config.js'),
            `export default {
  discoveryBranch: 'ver/0.0.7',
  getContextListFn: () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};`,
            'utf-8',
        );

        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'validate',
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/primaryBranch|primaryBranches|ver\/0\.0\.7/i);
    });

    it('succeeds plan preview when discoveryBranch is listed (no pre-flight)', async () => {
        await writeJsonFile({
            filePath: path.join(localConfigFolderPath, 'local.json'),
            data: {
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
            },
        });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'preview-lump', 'config.js'),
            `export default {
  discoveryBranch: 'ver/0.0.9',
  baseBranch: 'ver/0.0.9',
  getContextListFn: () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};`,
            'utf-8',
        );

        const branchBefore = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: projectRoot,
            encoding: 'utf-8',
        }).trim();

        const result = await planLumpFromJsConfig({
            lumpName: 'preview-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth: 'contexts',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        const branchAfter = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: projectRoot,
            encoding: 'utf-8',
        }).trim();
        expect(branchAfter).toBe(branchBefore);
    });

    /**
     * clean-local-project-json-config W2 / C4 — skipped until plan path applies lump defaults.
     */
    describe('plan lump defaults (clean-local-project-json-config W2/C4)', () => {
        it('W2: plan uses inherited command from project via applyLumpConfigDefaults', async () => {
            const { applyLumpConfigDefaults } = await import('../applyLumpConfigDefaults');
            const applySpy = vi.spyOn(
                await import('../applyLumpConfigDefaults'),
                'applyLumpConfigDefaults',
            );

            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'project.json'),
                data: {
                    projectName: 'preview-project',
                    command: 'cursor',
                },
            });
            await fs.writeFile(
                path.join(localConfigFolderPath, 'lumps', 'preview-lump', 'config.js'),
                `export default {
  getContextListFn: () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`,
                'utf-8',
            );

            try {
                const result = await planLumpFromJsConfig({
                    lumpName: 'preview-lump',
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    projectRoot,
                    depth: 'validate',
                });
                expect(result.success).toBe(true);
                expect(applySpy).toHaveBeenCalled();
                const call = applySpy.mock.calls[0]?.[0];
                expect(call?.resolved.command).toBe('cursor');
                const overlaid = applyLumpConfigDefaults(call!);
                expect(overlaid.command).toBe('cursor');
            } finally {
                applySpy.mockRestore();
            }
        });

        it('C4: plan reports tooManyOpenBranches when cap inherited from project', async () => {
            const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-cap-remote-'));
            try {
                execGit('init --bare', remoteDir);
                execGit(`remote add origin ${remoteDir}`, projectRoot);
                execGit('push -u origin main', projectRoot);

                const makeOpen = (ctx: string) => {
                    const branch = `lump/preview-lump/${ctx}`;
                    execGit('checkout main', projectRoot);
                    execGit(`checkout -b ${branch}`, projectRoot);
                    execGit('commit --allow-empty -m "lump work"', projectRoot);
                    execGit(`push origin ${branch}`, projectRoot);
                    execGit('checkout main', projectRoot);
                };
                makeOpen('ctx-a');
                makeOpen('ctx-b');

                await writeJsonFile({
                    filePath: path.join(localConfigFolderPath, 'project.json'),
                    data: {
                        projectName: 'preview-project',
                        maximumNumberOfConcurrentBranches: 2,
                    },
                });

                const result = await planLumpFromJsConfig({
                    lumpName: 'preview-lump',
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    projectRoot,
                    depth: 'plan',
                });
                expect(result.success).toBe(true);
                if (!result.success) throw new Error('unreachable');
                expect(result.data.plan?.skipped).toMatchObject({
                    reason: 'tooManyOpenBranches',
                    maximumNumberOfConcurrentBranches: 2,
                });
            } finally {
                await fs.rm(remoteDir, { recursive: true, force: true });
            }
        });
    });
});
