import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LUMP_PLAN_UTIL_CONFIG_TS } from '../../testing/tsLumpFixtures';
import { planLumpFromJsConfig } from './main';

const FIXTURES_GLOBAL = path.resolve(__dirname, '../jsConfigToRunLumpInput/__fixtures__/global-config');

const LUMP_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
  prompt: {
    promptFn: () => 'preview prompt',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('planLumpFromJsConfig', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-util-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        globalConfigFolderPath = FIXTURES_GLOBAL;
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'preview-lump'), { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', projectBaseBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'preview-project' }),
            'utf-8',
        );

        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);

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
});
