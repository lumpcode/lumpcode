import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Postinstall top-level import chain — all must ship in the npm tarball. */
const POSTINSTALL_SCRIPT_CHAIN = [
    'scripts/esbuild-sidecar.mjs',
    'scripts/native-binary.mjs',
    'scripts/postinstall.mjs',
];

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {string | undefined} */
let packWorkDir;
/** @type {string | undefined} */
let tarballPath;
/** @type {string | undefined} */
let extractedPkgRoot;

function runOrThrow(command, args, options = {}) {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        ...options,
    });
    if (result.status !== 0) {
        const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
        throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${detail}`);
    }
    return result;
}

function listTarballPaths(archivePath) {
    const result = runOrThrow('tar', ['tzf', archivePath], { encoding: 'utf8' });
    return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

beforeAll(() => {
    packWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumpcode-npm-pack-postinstall-'));
    runOrThrow('npm', ['pack', '--pack-destination', packWorkDir, '--silent'], {
        cwd: pkgRoot,
        env: { ...process.env, npm_config_loglevel: 'error' },
    });

    const archiveName = fs
        .readdirSync(packWorkDir)
        .find((name) => name.endsWith('.tgz'));
    if (!archiveName) {
        throw new Error(`npm pack did not produce a tarball in ${packWorkDir}`);
    }

    tarballPath = path.join(packWorkDir, archiveName);
    const extractDir = path.join(packWorkDir, 'extract');
    fs.mkdirSync(extractDir, { recursive: true });
    runOrThrow('tar', ['xzf', tarballPath, '-C', extractDir]);
    extractedPkgRoot = path.join(extractDir, 'package');
});

afterAll(() => {
    if (packWorkDir) {
        fs.rmSync(packWorkDir, { recursive: true, force: true });
    }
});

describe('npm pack postinstall', () => {
    it('lists the full postinstall import chain in package.json files', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
        expect(Array.isArray(pkg.files)).toBe(true);
        for (const relativePath of POSTINSTALL_SCRIPT_CHAIN) {
            expect(pkg.files, `missing files entry: ${relativePath}`).toContain(relativePath);
        }
    });

    it('includes postinstall scripts in the packed tarball', () => {
        const tarballPaths = listTarballPaths(tarballPath);
        for (const relativePath of POSTINSTALL_SCRIPT_CHAIN) {
            expect(
                tarballPaths,
                `tarball missing ${relativePath}`,
            ).toContain(`package/${relativePath}`);
        }
    });

    it('loads native-binary from the extracted pack (postinstall import chain)', async () => {
        const moduleUrl = pathToFileURL(
            path.join(extractedPkgRoot, 'scripts', 'native-binary.mjs'),
        ).href;
        await expect(import(moduleUrl)).resolves.toBeDefined();
    });

    it('runs postinstall from the extracted pack when the bundle is present', () => {
        const bundlePath = path.join(extractedPkgRoot, 'dist', 'index.js');
        if (!fs.existsSync(bundlePath)) {
            expect.fail(
                'dist/index.js missing — run npm run build:bundle -w=@lumpcode/cli before this test',
            );
        }

        const env = { ...process.env, LUMPCODE_SKIP_BINARY: '1' };
        delete env.CI;

        const result = spawnSync(process.execPath, ['scripts/postinstall.mjs'], {
            cwd: extractedPkgRoot,
            env,
            encoding: 'utf8',
        });

        expect(result.status, [result.stdout, result.stderr].filter(Boolean).join('\n')).toBe(0);
    });
});
