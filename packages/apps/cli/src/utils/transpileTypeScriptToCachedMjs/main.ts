import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { isSea } from 'node:sea';

import { failure, Failure, success, Success } from '@lumpcode/core';

const execFileAsync = promisify(execFile);

let esbuildBinaryPathConfigured = false;

const CACHE_GITIGNORE_LINE = '.lumpcode/.cache/';

export function isTypeScriptModulePath(filePath: string): boolean {
    return filePath.endsWith('.ts');
}

function configureEsbuildBinaryPath(): void {
    if (esbuildBinaryPathConfigured) return;
    esbuildBinaryPathConfigured = true;
    if (!isSea()) return;

    const execDir = path.dirname(process.execPath);
    const binaryName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
    process.env.ESBUILD_BINARY_PATH = path.join(execDir, binaryName);
}

async function findLumpcodeRoot(sourceAbsolutePath: string): Promise<string | null> {
    let normalized = path.resolve(sourceAbsolutePath);
    try {
        normalized = await fs.realpath(normalized);
    } catch {
        // keep resolved path when source is being created
    }

    let current = path.dirname(normalized);
    const root = path.parse(normalized).root;
    while (current !== root) {
        if (path.basename(current) === '.lumpcode') {
            return current;
        }
        current = path.dirname(current);
    }
    return null;
}

async function resolveCacheRoot(sourceAbsolutePath: string): Promise<string> {
    const lumpcodeRoot = await findLumpcodeRoot(sourceAbsolutePath);
    if (lumpcodeRoot) {
        await ensureCacheGitignored(lumpcodeRoot);
        return path.join(lumpcodeRoot, '.cache', 'transpile');
    }
    return path.join(os.tmpdir(), 'lumpcode-transpile');
}

async function ensureCacheGitignored(lumpcodeRoot: string): Promise<void> {
    const gitignorePath = path.join(path.dirname(lumpcodeRoot), '.gitignore');
    let content = '';
    try {
        content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
        // create or append below
    }

    const existingLines = new Set(content.split(/\r?\n/).map((line) => line.trim()));
    if (existingLines.has(CACHE_GITIGNORE_LINE)) return;

    const prefix = content.length === 0 ? '' : content.endsWith('\n') ? '' : '\n';
    await fs.writeFile(gitignorePath, `${content}${prefix}${CACHE_GITIGNORE_LINE}\n`, 'utf-8');
}

function hashSourcePath(sourceAbsolutePath: string): string {
    return crypto.createHash('sha256').update(sourceAbsolutePath).digest('hex');
}

type CachePaths = {
    cacheDir: string;
    metaPath: string;
};

function outPathForMtime(cacheDir: string, sourceMtimeMs: number): string {
    return path.join(cacheDir, String(Math.trunc(sourceMtimeMs)), 'out.mjs');
}

function cachePathsForSource(cacheRoot: string, sourceAbsolutePath: string): CachePaths {
    const cacheDir = path.join(cacheRoot, hashSourcePath(sourceAbsolutePath));
    return {
        cacheDir,
        metaPath: path.join(cacheDir, 'meta.json'),
    };
}

type CacheMeta = {
    sourcePath: string;
    sourceMtimeMs: number;
    outPath: string;
};

async function readStoredMeta(metaPath: string): Promise<CacheMeta | null> {
    try {
        const raw = await fs.readFile(metaPath, 'utf-8');
        return JSON.parse(raw) as CacheMeta;
    } catch {
        return null;
    }
}

async function isCacheValid(
    sourceAbsolutePath: string,
    sourceMtimeMs: number,
    paths: CachePaths,
): Promise<CacheMeta | null> {
    const stored = await readStoredMeta(paths.metaPath);
    if (!stored || stored.sourcePath !== sourceAbsolutePath || stored.sourceMtimeMs !== sourceMtimeMs) {
        return null;
    }
    try {
        await fs.access(stored.outPath);
        return stored;
    } catch {
        return null;
    }
}

function formatEsbuildError(sourceAbsolutePath: string, error: unknown): string {
    if (error && typeof error === 'object' && 'errors' in error) {
        const buildFailure = error as { errors?: Array<{ text?: string }> };
        const snippet = buildFailure.errors?.map((e) => e.text).filter(Boolean).join('; ');
        if (snippet) {
            return `Failed to transpile ${sourceAbsolutePath}: ${snippet}`;
        }
    }
    if (error && typeof error === 'object' && 'stderr' in error) {
        const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
        if (stderr) {
            return `Failed to transpile ${sourceAbsolutePath}: ${stderr}`;
        }
    }
    return `Failed to transpile ${sourceAbsolutePath}: ${String(error)}`;
}

function shouldBundleSource(sourceContent: string): boolean {
    return /from\s+['"]\.{1,2}\//.test(sourceContent);
}

/** Keep npm deps (e.g. `@lumpcode/*`) external when bundling relative lump-local modules. */
const ESBUILD_PACKAGES_EXTERNAL = 'external' as const;

async function patchImportMetaUrlInOutput(outPath: string, sourceAbsolutePath: string): Promise<void> {
    const source = await fs.readFile(outPath, 'utf-8');
    if (!source.includes('import.meta.url')) return;

    const patched = [
        `import { pathToFileURL as __lumpPathToFileURL } from 'node:url';`,
        `const __lumpImportMetaUrl = __lumpPathToFileURL(${JSON.stringify(sourceAbsolutePath)}).href;`,
        source.split('import.meta.url').join('__lumpImportMetaUrl'),
    ].join('\n');
    await fs.writeFile(outPath, patched, 'utf-8');
}

async function runEsbuildTranspile(absolutePath: string, outPath: string): Promise<void> {
    configureEsbuildBinaryPath();
    const sourceContent = await fs.readFile(absolutePath, 'utf-8');
    const bundle = shouldBundleSource(sourceContent);

    if (isSea()) {
        const binaryPath = process.env.ESBUILD_BINARY_PATH;
        if (!binaryPath) {
            throw new Error('ESBUILD_BINARY_PATH is not configured');
        }
        try {
            await fs.access(binaryPath);
        } catch {
            throw new Error(`esbuild binary not found at ${binaryPath}`);
        }
        const args = [
            absolutePath,
            '--format=esm',
            '--platform=node',
            '--target=node22',
            `--outfile=${outPath}`,
        ];
        if (bundle) {
            args.splice(1, 0, '--bundle', `--packages=${ESBUILD_PACKAGES_EXTERNAL}`);
        }
        await execFileAsync(
            binaryPath,
            args,
            {
                cwd: path.dirname(absolutePath),
                env: process.env,
                maxBuffer: 10 * 1024 * 1024,
            },
        );
        return;
    }

    const esbuild = await import('esbuild');
    await esbuild.build({
        absWorkingDir: path.dirname(absolutePath),
        bundle,
        entryPoints: [absolutePath],
        format: 'esm',
        packages: bundle ? ESBUILD_PACKAGES_EXTERNAL : undefined,
        platform: 'node',
        target: 'node22',
        write: true,
        outfile: outPath,
    });
}

export async function transpileTypeScriptToCachedMjs(
    sourceAbsolutePath: string,
): Promise<Success<string> | Failure<string>> {
    const absolutePath = path.resolve(sourceAbsolutePath);

    let sourceStat;
    try {
        sourceStat = await fs.stat(absolutePath);
    } catch (error) {
        return failure(`Failed to transpile ${absolutePath}: ${String(error)}`);
    }

    const cacheRoot = await resolveCacheRoot(absolutePath);
    const paths = cachePathsForSource(cacheRoot, absolutePath);

    const cached = await isCacheValid(absolutePath, sourceStat.mtimeMs, paths);
    if (cached) {
        return success(cached.outPath);
    }

    const outPath = outPathForMtime(paths.cacheDir, sourceStat.mtimeMs);

    try {
        await fs.mkdir(paths.cacheDir, { recursive: true });
        await runEsbuildTranspile(absolutePath, outPath);
        await patchImportMetaUrlInOutput(outPath, absolutePath);

        const meta: CacheMeta = {
            sourcePath: absolutePath,
            sourceMtimeMs: sourceStat.mtimeMs,
            outPath,
        };
        await fs.writeFile(paths.metaPath, JSON.stringify(meta), 'utf-8');

        return success(outPath);
    } catch (error) {
        return failure(formatEsbuildError(absolutePath, error));
    }
}
