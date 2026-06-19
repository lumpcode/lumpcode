import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { command } from './main';

const LUMP_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('lump-plan command', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;
    const globalConfigFolderPath = path.join(os.homedir(), '.lumpcode-test-plan-global');

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-plan-cmd-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'my-lump'), { recursive: true });
        await fs.mkdir(globalConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', projectBaseBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'plan-cmd-test' }),
            'utf-8',
        );

        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);

        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'my-lump', 'config.js'),
            LUMP_CONFIG_JS,
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    function makeHandler() {
        return command.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    it('succeeds with validate-only by default', async () => {
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.valid).toBe(true);
        expect(result.data.messages.some((m) => m.includes('valid'))).toBe(true);
    });

    it('returns contexts with --contexts --json', async () => {
        const result = await makeHandler()({
            options: { contexts: true, json: true },
            arguments: { lumpName: 'my-lump' },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.contexts?.[0].name).toBe('alpha');
    });

    it('fails when lump config is missing', async () => {
        const result = await makeHandler()({
            options: {},
            arguments: { lumpName: 'missing-lump' },
        });
        expect(result.success).toBe(false);
    });
});
