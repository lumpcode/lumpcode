import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import { validateDaemonLaunch } from './main';

const minimalLumpConfigJson = `{
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "claude"
  }
}`;

function createLogger(): Logger & { warnings: string[] } {
    const warnings: string[] = [];
    const logger: Logger & { warnings: string[] } = {
        warnings,
        info: vi.fn(),
        warn: (message: string) => {
            warnings.push(message);
        },
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => logger,
    };
    return logger;
}

describe('validateDaemonLaunch', () => {
    let localConfigFolderPath: string;
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-validate-daemon-launch-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('warns and succeeds when a lump directory has no loadable config (dedicated)', async () => {
        const validDir = path.join(localConfigFolderPath, 'lumps', 'alpha');
        await fs.mkdir(validDir, { recursive: true });
        await fs.writeFile(path.join(validDir, 'config.json'), minimalLumpConfigJson, 'utf-8');

        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'v0.0.9'), { recursive: true });

        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath: path.join(os.homedir(), '.lumpcode'),
            localConfig: { mode: 'dedicated', primaryBranch: 'main' },
            logger,
        });

        expect(result.success).toBe(true);
        expect(logger.warnings).toEqual([
            'lump "v0.0.9": Lump config not found for v0.0.9; skipping',
        ]);
    });

    it('returns failure when an explicit lumpName has no loadable config', async () => {
        const logger = createLogger();
        const result = await validateDaemonLaunch({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath: path.join(os.homedir(), '.lumpcode'),
            localConfig: { mode: 'dedicated', primaryBranch: 'main' },
            lumpNameOpt: 'missing',
            logger,
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Lump config not found for missing');
        expect(logger.warnings).toEqual([]);
    });
});
