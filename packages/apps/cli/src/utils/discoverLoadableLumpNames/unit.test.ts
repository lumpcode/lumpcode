import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { createSpyLogger } from '../../testing';
import { writeLumpConfigJson } from '../writeLumpConfigJson';
import { discoverLoadableLumpNames, discoverLoadableLumps } from './main';

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
        await writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' });
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'v0.0.9'), { recursive: true });

        const logger = createSpyLogger();
        const lumps = await discoverLoadableLumps({ localConfigFolderPath, logger });

        expect(lumps.map((l) => l.lumpName)).toEqual(['alpha']);
        expect(lumps[0]?.jsConfig.contextListJson).toBeDefined();
        expect(logger.warnings).toEqual([
            `lump "v0.0.9": No config.ts, config.js, or config.json in ${path.join(localConfigFolderPath, 'lumps', 'v0.0.9')}; skipping`,
        ]);
    });

    it('does not warn when logger is omitted', async () => {
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'empty'), { recursive: true });

        const names = await discoverLoadableLumpNames({ localConfigFolderPath });

        expect(names).toEqual([]);
    });
});
