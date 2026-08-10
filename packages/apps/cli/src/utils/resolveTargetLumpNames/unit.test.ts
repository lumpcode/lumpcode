import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { writeLumpConfigJson } from '../writeLumpConfigJson';
import { resolveTargetLumpNames } from './main';

describe('resolveTargetLumpNames', () => {
    let localConfigFolderPath: string;

    beforeEach(async () => {
        localConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-resolve-target-'));
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps'), { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(localConfigFolderPath, { recursive: true, force: true });
    });

    it('returns failure when no loadable lumps exist', async () => {
        const result = await resolveTargetLumpNames({ localConfigFolderPath });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('No lumps with a loadable config');
    });

    it('returns all loadable lump names when lumpName is omitted', async () => {
        for (const name of ['beta', 'alpha']) {
            await writeLumpConfigJson({ localConfigFolderPath, lumpName: name });
        }

        const result = await resolveTargetLumpNames({ localConfigFolderPath });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['alpha', 'beta']);
    });

    it('returns failure when the requested lump has no loadable config', async () => {
        const result = await resolveTargetLumpNames({
            localConfigFolderPath,
            lumpName: 'missing',
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('No lump named "missing"');
    });

    it('returns the requested lump when its config is loadable', async () => {
        await writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' });

        const result = await resolveTargetLumpNames({
            localConfigFolderPath,
            lumpName: 'alpha',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['alpha']);
    });

    it('returns the requested lump when only config.ts exists', async () => {
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'ts-only');
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(
            path.join(lumpDir, 'config.ts'),
            `export default {
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'Hi', command: 'claude' as const },
};`,
            'utf-8',
        );

        const result = await resolveTargetLumpNames({
            localConfigFolderPath,
            lumpName: 'ts-only',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual(['ts-only']);
    });
});
