import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const isSeaMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('node:sea', () => ({
    isSea: isSeaMock,
}));

import { resolveBundledAssetPath } from './main';

describe('resolveBundledAssetPath', () => {
    it('returns the bundled path when it exists beside callerDir', async () => {
        const callerDir = await mkdtemp(join(tmpdir(), 'bundle-caller-'));
        const bundledDir = join(callerDir, 'schemas');
        await mkdir(bundledDir, { recursive: true });
        const bundledFile = join(bundledDir, 'test.schema.json');
        await writeFile(bundledFile, '{}', 'utf8');

        const resolved = resolveBundledAssetPath(
            callerDir,
            join('schemas', 'test.schema.json'),
            join('..', '..', 'schemas', 'test.schema.json'),
        );

        expect(resolved).toBe(bundledFile);
    });

    it('falls back to devSourceRelativePath when the bundled path is missing', async () => {
        const root = await mkdtemp(join(tmpdir(), 'bundle-dev-'));
        const callerDir = join(root, 'dist', 'utils');
        const devDir = join(root, 'schemas');
        await mkdir(callerDir, { recursive: true });
        await mkdir(devDir, { recursive: true });
        const devFile = join(devDir, 'test.schema.json');
        await writeFile(devFile, '{}', 'utf8');

        const resolved = resolveBundledAssetPath(
            callerDir,
            join('schemas', 'test.schema.json'),
            join('..', '..', 'schemas', 'test.schema.json'),
        );

        expect(resolved).toBe(devFile);
    });

    it('uses process.execPath when running as a SEA binary', async () => {
        isSeaMock.mockReturnValueOnce(true);
        const execDir = await mkdtemp(join(tmpdir(), 'bundle-sea-'));
        const assetDir = join(execDir, 'presets', 'commands');
        await mkdir(assetDir, { recursive: true });
        const assetFile = join(assetDir, 'cursor.js');
        await writeFile(assetFile, '// preset', 'utf8');

        const execPath = join(execDir, 'lumpcode');
        const previousExecPath = process.execPath;
        Object.defineProperty(process, 'execPath', { value: execPath });

        try {
            const resolved = resolveBundledAssetPath(
                '/ignored-in-sea',
                join('presets', 'commands', 'cursor.js'),
                join('..', '..', 'presets', 'commands', 'cursor.js'),
            );
            expect(resolved).toBe(assetFile);
        } finally {
            Object.defineProperty(process, 'execPath', { value: previousExecPath });
        }
    });
});
