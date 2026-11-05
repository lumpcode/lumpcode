import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

import { readCacheMeta, withTsLumpProject } from '../../testing/tsLumpFixtures';
import { isTypeScriptModulePath, needsTypeScriptTranspile, transpileTypeScriptToCachedMjs } from './main';

function assertSuccess<T>(result: { success: boolean; data?: T }): T {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    return result.data as T;
}

describe('transpileTypeScriptToCachedMjs', () => {
    async function importDefault(cachedMjsPath: string): Promise<unknown> {
        const mod = await import(pathToImportUrl(cachedMjsPath));
        return mod.default;
    }

    function pathToImportUrl(absolutePath: string): string {
        return new URL(`file://${absolutePath}`).href;
    }

    it('T1 transpiles a minimal default export and imports it', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const sourcePath = path.join(lumpDir, 'config.ts');
            await fs.writeFile(sourcePath, 'export default { marker: "ts-default" as const };', 'utf-8');

            const outPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const value = await importDefault(outPath);
            expect(value).toEqual({ marker: 'ts-default' });
        });
    });

    it('T2 transpiles export default function and keeps it callable', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const sourcePath = path.join(lumpDir, 'fn.ts');
            await fs.writeFile(
                sourcePath,
                'export default function greet(): string { return "hello-ts"; }',
                'utf-8',
            );

            const outPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const fn = await importDefault(outPath);
            expect(typeof fn).toBe('function');
            expect((fn as () => string)()).toBe('hello-ts');
        });
    });

    it('T3 bundles relative imports from the entry file', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            await fs.writeFile(path.join(lumpDir, 'helper.ts'), 'export default { nested: true as const };', 'utf-8');
            const sourcePath = path.join(lumpDir, 'config.ts');
            await fs.writeFile(
                sourcePath,
                'import helper from "./helper";\nexport default { helper };',
                'utf-8',
            );

            const outPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const value = await importDefault(outPath);
            expect(value).toEqual({ helper: { nested: true } });
        });
    });

    it('T3b keeps @lumpcode/* npm imports external when bundling relative imports', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            await fs.writeFile(
                path.join(lumpDir, 'helper.ts'),
                'import { success } from "@lumpcode/core";\nexport default success("bundled-helper");',
                'utf-8',
            );
            const sourcePath = path.join(lumpDir, 'config.ts');
            await fs.writeFile(
                sourcePath,
                'import helper from "./helper";\nexport default { helper };',
                'utf-8',
            );

            const outPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const source = await fs.readFile(outPath, 'utf-8');
            expect(source).not.toContain('Dynamic require of');
            expect(source).toContain('@lumpcode/core');

            const value = await importDefault(outPath);
            expect(value).toEqual({ helper: { success: true, data: 'bundled-helper' } });
        });
    });

    it('T4 reuses cache when source mtime is unchanged', async () => {
        await withTsLumpProject(async ({ lumpDir, projectRoot }) => {
            const sourcePath = path.join(lumpDir, 'stable.ts');
            await fs.writeFile(sourcePath, 'export default "v1";', 'utf-8');

            const buildSpy = vi.spyOn(esbuild, 'build');
            try {
                const first = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                const firstStat = await fs.stat(first);
                const second = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                const secondStat = await fs.stat(second);

                expect(second).toBe(first);
                expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
                expect(buildSpy).toHaveBeenCalledTimes(1);
                expect((await readCacheMeta(projectRoot)).length).toBeGreaterThan(0);
            } finally {
                buildSpy.mockRestore();
            }
        });
    });

    it('T5 invalidates cache when source content changes', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const sourcePath = path.join(lumpDir, 'mutate.ts');
            await fs.writeFile(sourcePath, 'export default "v1";', 'utf-8');
            const firstPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            expect(await importDefault(firstPath)).toBe('v1');

            await fs.writeFile(sourcePath, 'export default "v2";', 'utf-8');
            const secondPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            expect(await importDefault(secondPath)).toBe('v2');
        });
    });

    it('T5b invalidates bundled cache when a relative dependency changes without touching the entry file', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const helperPath = path.join(lumpDir, 'helper.ts');
            await fs.writeFile(helperPath, 'export default "v1";', 'utf-8');
            const sourcePath = path.join(lumpDir, 'config.ts');
            await fs.writeFile(
                sourcePath,
                'import helper from "./helper";\nexport default helper;',
                'utf-8',
            );

            const buildSpy = vi.spyOn(esbuild, 'build');
            try {
                const firstPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                expect(await importDefault(firstPath)).toBe('v1');

                await fs.writeFile(helperPath, 'export default "v2";', 'utf-8');
                const secondPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                expect(await importDefault(secondPath)).toBe('v2');
                expect(buildSpy).toHaveBeenCalledTimes(2);
            } finally {
                buildSpy.mockRestore();
            }
        });
    });

    it('T5c reuses bundled cache when entry and dependencies are unchanged', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const helperPath = path.join(lumpDir, 'helper.ts');
            await fs.writeFile(helperPath, 'export default "stable";', 'utf-8');
            const sourcePath = path.join(lumpDir, 'config.ts');
            await fs.writeFile(
                sourcePath,
                'import helper from "./helper";\nexport default helper;',
                'utf-8',
            );

            const buildSpy = vi.spyOn(esbuild, 'build');
            try {
                const firstPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                const secondPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));

                expect(secondPath).toBe(firstPath);
                expect(buildSpy).toHaveBeenCalledTimes(1);
            } finally {
                buildSpy.mockRestore();
            }
        });
    });

    it('T5d stores dependency mtimes in cache meta for bundled entries', async () => {
        await withTsLumpProject(async ({ lumpDir, projectRoot }) => {
            const helperPath = path.join(lumpDir, 'helper.ts');
            await fs.writeFile(helperPath, 'export default "meta";', 'utf-8');
            const sourcePath = path.join(lumpDir, 'config.ts');
            await fs.writeFile(
                sourcePath,
                'import helper from "./helper";\nexport default helper;',
                'utf-8',
            );

            assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const metas = await readCacheMeta(projectRoot);
            const configMeta = metas.find((entry) => entry.meta.sourcePath === sourcePath);
            expect(configMeta).toBeDefined();
            expect(configMeta?.meta.dependencyMtimes).toEqual({
                [helperPath]: (await fs.stat(helperPath)).mtimeMs,
            });
        });
    });

    it('T6 writes cache under project .lumpcode/.cache/transpile/', async () => {
        await withTsLumpProject(async ({ lumpDir, projectRoot }) => {
            const sourcePath = path.join(lumpDir, 'cached.ts');
            await fs.writeFile(sourcePath, 'export default "cached";', 'utf-8');

            assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const cacheRoot = path.join(projectRoot, '.lumpcode', '.cache', 'transpile');
            await expect(fs.access(cacheRoot)).resolves.toBeUndefined();
            const metas = await readCacheMeta(projectRoot);
            expect(metas.length).toBeGreaterThan(0);
            expect(metas[0]?.outPath.endsWith('out.mjs')).toBe(true);
        });
    });

    it('T7 caches global command modules under global .lumpcode/.cache/', async () => {
        await withTsLumpProject(async ({ globalConfigFolderPath }) => {
            const commandsDir = path.join(globalConfigFolderPath, 'commands');
            await fs.mkdir(commandsDir, { recursive: true });
            const sourcePath = path.join(commandsDir, 'foo.ts');
            await fs.writeFile(sourcePath, 'export const command = () => ({ executable: "x" });', 'utf-8');

            assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            const cacheRoot = path.join(globalConfigFolderPath, '.cache', 'transpile');
            await expect(fs.access(cacheRoot)).resolves.toBeUndefined();
        }, { fixture: 'global-command' });
    });

    it('T8b transpiles a .js entry that imports a .ts helper and invalidates when the helper changes', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const helperPath = path.join(lumpDir, 'helper.ts');
            await fs.writeFile(helperPath, 'const value: string = "v1";\nexport default value;\n', 'utf-8');
            const sourcePath = path.join(lumpDir, 'config.js');
            await fs.writeFile(
                sourcePath,
                [
                    'import { success } from "@lumpcode/core";',
                    'import helper from "./helper.ts";',
                    'export default { helper, bundled: success(helper), entryUrl: import.meta.url };',
                ].join('\n'),
                'utf-8',
            );

            const buildSpy = vi.spyOn(esbuild, 'build');
            try {
                const firstPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                const first = await importDefault(firstPath) as {
                    helper: string;
                    bundled: { success: boolean; data: string };
                    entryUrl: string;
                };
                expect(first.helper).toBe('v1');
                expect(first.bundled).toEqual({ success: true, data: 'v1' });
                expect(first.entryUrl).toBe(pathToFileURL(sourcePath).href);

                const bundledSource = await fs.readFile(firstPath, 'utf-8');
                expect(bundledSource).toContain('@lumpcode/core');
                expect(bundledSource).not.toContain('Dynamic require of');
                expect(bundledSource).not.toContain('./helper.ts');

                const secondPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                expect(secondPath).toBe(firstPath);
                expect(buildSpy).toHaveBeenCalledTimes(1);

                await fs.writeFile(helperPath, 'const value: string = "v2";\nexport default value;\n', 'utf-8');
                const thirdPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
                expect((await importDefault(thirdPath) as { helper: string }).helper).toBe('v2');
                expect(buildSpy).toHaveBeenCalledTimes(2);
            } finally {
                buildSpy.mockRestore();
            }
        });
    });

    it('T8c bundles a .js entry whose only relative import is a side-effect .ts import', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            await fs.writeFile(
                path.join(lumpDir, 'helper.ts'),
                'export const marker: string = "side";\n',
                'utf-8',
            );
            const sourcePath = path.join(lumpDir, 'config.js');
            await fs.writeFile(sourcePath, 'import "./helper.ts";\nexport default "entry";\n', 'utf-8');

            const outPath = assertSuccess(await transpileTypeScriptToCachedMjs(sourcePath));
            expect(await importDefault(outPath)).toBe('entry');
            expect(await fs.readFile(outPath, 'utf-8')).not.toContain('helper.ts');
        });
    });

    it('T8 returns failure with source path and esbuild error snippet on syntax error', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const sourcePath = path.join(lumpDir, 'broken.ts');
            await fs.writeFile(sourcePath, 'export default {', 'utf-8');

            const result = await transpileTypeScriptToCachedMjs(sourcePath);
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain(sourcePath);
            expect(result.data.toLowerCase()).toMatch(/error|expected|syntax/);
        });
    });
});

describe('isTypeScriptModulePath', () => {
    it('T9 returns true for .ts and false for other extensions', () => {
        expect(isTypeScriptModulePath('/tmp/config.ts')).toBe(true);
        expect(isTypeScriptModulePath('/tmp/config.js')).toBe(false);
        expect(isTypeScriptModulePath('/tmp/config.json')).toBe(false);
        expect(isTypeScriptModulePath('/tmp/config.tsx')).toBe(false);
    });
});

describe('needsTypeScriptTranspile', () => {
    it('T10 returns true for a .ts path', async () => {
        expect(await needsTypeScriptTranspile('/tmp/does-not-need-to-exist/config.ts')).toBe(true);
    });

    it('T11 returns true when a .js or .mjs file imports ./helper.ts', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            await fs.writeFile(path.join(lumpDir, 'helper.ts'), 'export const marker: string = "ts";\n', 'utf-8');
            const jsPath = path.join(lumpDir, 'config.js');
            const mjsPath = path.join(lumpDir, 'config.mjs');
            const source = 'import { marker } from "./helper.ts";\nexport default marker;\n';
            await fs.writeFile(jsPath, source, 'utf-8');
            await fs.writeFile(mjsPath, source, 'utf-8');

            expect(await needsTypeScriptTranspile(jsPath)).toBe(true);
            expect(await needsTypeScriptTranspile(mjsPath)).toBe(true);
        });
    });

    it('T12 returns true when a .js file imports ./dir resolving to dir/index.ts', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const indexPath = path.join(lumpDir, 'dir', 'index.ts');
            await fs.mkdir(path.dirname(indexPath), { recursive: true });
            await fs.writeFile(indexPath, 'export const marker: string = "index";\n', 'utf-8');
            const jsPath = path.join(lumpDir, 'config.js');
            await fs.writeFile(jsPath, 'import { marker } from "./dir";\nexport default marker;\n', 'utf-8');

            expect(await needsTypeScriptTranspile(jsPath)).toBe(true);
        });
    });

    it('T13 returns true when a .ts file is two hops away through a .js file', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            await fs.writeFile(path.join(lumpDir, 'helper.ts'), 'export const marker: string = "deep";\n', 'utf-8');
            await fs.writeFile(
                path.join(lumpDir, 'mid.js'),
                'import { marker } from "./helper.ts";\nexport default marker;\n',
                'utf-8',
            );
            const jsPath = path.join(lumpDir, 'config.js');
            await fs.writeFile(jsPath, 'import marker from "./mid.js";\nexport default marker;\n', 'utf-8');

            expect(await needsTypeScriptTranspile(jsPath)).toBe(true);
        });
    });

    it('T14 returns false when a .js file imports only other .js files or only npm packages', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            await fs.writeFile(path.join(lumpDir, 'only.js'), 'export default 1;\n', 'utf-8');
            const jsDepsPath = path.join(lumpDir, 'js-deps.js');
            await fs.writeFile(jsDepsPath, 'import value from "./only.js";\nexport default value;\n', 'utf-8');
            const npmPath = path.join(lumpDir, 'npm-only.js');
            await fs.writeFile(
                npmPath,
                'import { success } from "@lumpcode/core";\nexport default success("x");\n',
                'utf-8',
            );
            const mjsPath = path.join(lumpDir, 'npm-only.mjs');
            await fs.writeFile(mjsPath, 'export default "plain";\n', 'utf-8');
            const cjsPath = path.join(lumpDir, 'config.cjs');
            await fs.writeFile(cjsPath, 'import helper from "./helper.ts";\nexports.helper = helper;\n', 'utf-8');

            expect(await needsTypeScriptTranspile(jsDepsPath)).toBe(false);
            expect(await needsTypeScriptTranspile(npmPath)).toBe(false);
            expect(await needsTypeScriptTranspile(mjsPath)).toBe(false);
            expect(await needsTypeScriptTranspile(cjsPath)).toBe(false);
        });
    });
});
