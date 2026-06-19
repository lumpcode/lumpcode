import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { installNativeBinary } from './native-binary.mjs';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function isNpmIgnoreScriptsEnabled() {
    return process.env.npm_config_ignore_scripts === 'true';
}

function isCiEnvironment() {
    return process.env.CI === 'true';
}

function isCliBundleMissing() {
    return !fs.existsSync(path.join(pkgRoot, 'dist', 'index.js'));
}

function isMonorepoDevCheckout() {
    return fs.existsSync(path.join(pkgRoot, 'src', 'root.ts'));
}

function isNativeBinaryDownloadDisabled() {
    return process.env.LUMPCODE_SKIP_BINARY === '1';
}

function shouldSkipPostinstall() {
    return (
        isNpmIgnoreScriptsEnabled()
        || isCiEnvironment()
        || isCliBundleMissing()
        || isMonorepoDevCheckout()
    );
}

function shouldSkipNativeBinaryDownload() {
    return isNativeBinaryDownloadDisabled() || shouldSkipPostinstall();
}

function logVerbose(message) {
    if (process.env.LUMPCODE_INSTALL_VERBOSE === '1') {
        console.log(`[lumpcode] ${message}`);
    }
}

async function main() {
    if (shouldSkipPostinstall()) {
        logVerbose('postinstall: skipped preset and native binary install');
        return;
    }

    const modulePath = path.join(pkgRoot, 'dist', 'installPresetCommands.mjs');
    const {
        installPresetCommands,
        resolveGlobalConfigFolderPath,
        resolveNpmBundlePresetsDir,
    } = await import(pathToFileURL(modulePath).href);

    const presetResult = await installPresetCommands({
        bundlePresetsDir: resolveNpmBundlePresetsDir(pkgRoot),
        globalConfigFolderPath: resolveGlobalConfigFolderPath(),
        overwrite: true,
    });
    if (presetResult.installed) {
        logVerbose(`postinstall: reinstalled ${presetResult.count} preset command module(s)`);
    } else {
        logVerbose(`postinstall: preset install skipped (${presetResult.reason ?? 'unknown'})`);
    }

    if (shouldSkipNativeBinaryDownload()) {
        logVerbose('postinstall: skipped native binary download');
        return;
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf-8'));
    const result = await installNativeBinary({ pkgRoot, version: pkg.version });

    if (result.installed) {
        logVerbose(`postinstall: installed native binary (${result.assetBase})`);
    } else {
        logVerbose(`postinstall: native binary not available (${result.reason ?? 'unknown'}), using Node fallback`);
    }
}

main().catch((error) => {
    logVerbose(`postinstall: install failed (${error instanceof Error ? error.message : String(error)})`);
});
