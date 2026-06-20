import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    withTsLumpProject,
    writeLumpConfigTs,
} from '../../testing/tsLumpFixtures';
import { discoverLoadableLumpNames } from '../discoverLoadableLumpNames';
import { getJsConfigFromLumpName } from './main';

const minimalJsonConfig = `{
  "contextListJson": { "NAME": "{NAME}.md" },
  "prompt": { "promptTemplate": "Hi @{NAME}", "command": "claude" }
}`;

describe('getJsConfigFromLumpName', () => {
    it('G1 loads config.ts when it is the only config file', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await writeLumpConfigTs(
                lumpDir,
                `export default {
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'from-ts', command: 'claude' },
};`,
            );

            const result = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.prompt).toMatchObject({ promptTemplate: 'from-ts' });
        });
    });

    it('G2 prefers config.ts over config.js', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await writeLumpConfigTs(
                lumpDir,
                `export default {
  lumpVariables: { source: 'ts' },
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'ts', command: 'claude' },
};`,
            );
            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  lumpVariables: { source: 'js' },
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'js', command: 'claude' },
};`,
                'utf-8',
            );

            const result = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.lumpVariables).toEqual({ source: 'ts' });
        });
    });

    it('G3 prefers config.ts over config.json', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await writeLumpConfigTs(
                lumpDir,
                `export default {
  lumpVariables: { source: 'ts' },
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'ts', command: 'claude' },
};`,
            );
            await fs.writeFile(path.join(lumpDir, 'config.json'), minimalJsonConfig, 'utf-8');

            const result = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.lumpVariables).toEqual({ source: 'ts' });
        });
    });

    it('G4 prefers config.js over config.json', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  lumpVariables: { source: 'js' },
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'js', command: 'claude' },
};`,
                'utf-8',
            );
            await fs.writeFile(path.join(lumpDir, 'config.json'), minimalJsonConfig, 'utf-8');

            const result = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.lumpVariables).toEqual({ source: 'js' });
        });
    });

    it('G5 fails when no config file exists', async () => {
        await withTsLumpProject(async ({ localConfigFolderPath, lumpName }) => {
            const result = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain(lumpName);
        });
    });

    it('G6 returns structured failure for invalid config.ts', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await fs.writeFile(path.join(lumpDir, 'config.ts'), 'export default {', 'utf-8');

            const result = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).not.toMatch(/not found/i);
            expect(result.data).toMatch(/config\.ts|syntax|parse|transpile|error/i);
        });
    });
});

describe('discoverLoadableLumpNames with config.ts', () => {
    it('includes lumps that only have config.ts', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await writeLumpConfigTs(
                lumpDir,
                `export default {
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'Hi', command: 'claude' },
};`,
            );

            const names = await discoverLoadableLumpNames(localConfigFolderPath);
            expect(names).toEqual([lumpName]);
        });
    });
});
