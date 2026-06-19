#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = process.platform === 'win32';
const nodeMode =
    process.argv.includes('--node') || process.env.LUMPCODE_E2E_RUNNER === 'node';
const forceBuild = process.argv.includes('--ci');

function seaBinaryPath() {
    const lumpcodeE2eBinary = process.env.LUMPCODE_E2E_BINARY?.trim();
    if (lumpcodeE2eBinary) return lumpcodeE2eBinary;
    if (process.platform === 'win32') {
        return path.join(cliRoot, 'bin', 'lumpcode-windows-x64.exe');
    }
    const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return path.join(cliRoot, 'bin', `lumpcode-${platform}-${arch}`);
}

function nodeLauncherPath() {
    return path.join(cliRoot, 'bin', 'lumpcode.js');
}

function distBundlePath() {
    return path.join(cliRoot, 'dist', 'index.js');
}

function seaBuildScript() {
    return process.platform === 'win32' ? 'build:sea:windows' : 'build:sea';
}

function runNpmScript(scriptName) {
    const result = spawnSync('npm', ['run', scriptName], { cwd: cliRoot, stdio: 'inherit', shell });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensureSeaBinary(binary) {
    if (fs.existsSync(binary)) return;
    const buildScript = seaBuildScript();
    console.error(`SEA binary not found at ${binary}; running ${buildScript}…`);
    runNpmScript(buildScript);
    if (!fs.existsSync(binary)) process.exit(1);
}

function ensureNodeBundle() {
    const launcher = nodeLauncherPath();
    const bundle = distBundlePath();
    if (fs.existsSync(launcher) && fs.existsSync(bundle)) return;
    console.error('Node e2e bundle missing; running build:bundle…');
    runNpmScript('build:bundle');
    if (!fs.existsSync(launcher) || !fs.existsSync(bundle)) {
        console.error(`Expected ${launcher} and ${bundle} after build:bundle`);
        process.exit(1);
    }
}

function prepareArtifacts() {
    if (nodeMode) {
        if (forceBuild) {
            runNpmScript('build:bundle');
            return;
        }
        ensureNodeBundle();
        return;
    }

    if (forceBuild) {
        runNpmScript(seaBuildScript());
        return;
    }
    ensureSeaBinary(seaBinaryPath());
}

function e2eEnv() {
    if (nodeMode) {
        const launcher = nodeLauncherPath();
        if (!fs.existsSync(launcher) || !fs.existsSync(distBundlePath())) {
            console.error(`Node e2e artifacts missing after prepare: ${launcher}`);
            process.exit(1);
        }
        return {
            ...process.env,
            LUMPCODE_E2E_RUNNER: 'node',
            LUMPCODE_E2E_CLI_ENTRY: launcher,
        };
    }

    const binary = seaBinaryPath();
    if (!fs.existsSync(binary)) {
        console.error(`SEA binary missing after prepare: ${binary}`);
        process.exit(1);
    }
    const env = { ...process.env, LUMPCODE_E2E_BINARY: binary };
    delete env.LUMPCODE_E2E_RUNNER;
    delete env.LUMPCODE_E2E_CLI_ENTRY;
    return env;
}

prepareArtifacts();

const vitest = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.config.e2e.ts'], {
    cwd: cliRoot,
    stdio: 'inherit',
    shell,
    env: e2eEnv(),
});
process.exit(vitest.status ?? 1);
