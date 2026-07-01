import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import { discoverLoadableLumpNames, discoverLoadableLumps } from './main';

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

describe('discoverLoadableLumps', () => {
    let localConfigFolderPath: string;

    beforeEach(async () => {
        localConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-discover-loadable-'));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(localConfigFolderPath, { recursive: true, force: true });
    });

    it('warns on invalid lump directories when logger is provided', async () => {
        const validDir = path.join(localConfigFolderPath, 'lumps', 'alpha');
        await fs.mkdir(validDir, { recursive: true });
        await fs.writeFile(path.join(validDir, 'config.json'), minimalLumpConfigJson, 'utf-8');
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'v0.0.9'), { recursive: true });

        const logger = createLogger();
        const lumps = await discoverLoadableLumps({ localConfigFolderPath, logger });

        expect(lumps.map((l) => l.lumpName)).toEqual(['alpha']);
        expect(lumps[0]?.jsConfig.contextListJson).toBeDefined();
        expect(logger.warnings).toEqual([
            'lump "v0.0.9": Lump config not found for v0.0.9; skipping',
        ]);
    });

    it('does not warn when logger is omitted', async () => {
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'empty'), { recursive: true });

        const names = await discoverLoadableLumpNames({ localConfigFolderPath });

        expect(names).toEqual([]);
    });
});
