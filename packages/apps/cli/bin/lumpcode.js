#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const pkgRoot = path.join(__dirname, '..');
const vendorDir = path.join(pkgRoot, 'vendor');
const markerPath = path.join(vendorDir, '.installed');
const nativeBinary =
    process.platform === 'win32'
        ? path.join(vendorDir, 'lumpcode.exe')
        : path.join(vendorDir, 'lumpcode');
const distEntry = path.join(pkgRoot, 'dist', 'index.js');
const args = process.argv.slice(2);

function run(executable, executableArgs) {
    const child = spawn(executable, executableArgs, {
        stdio: 'inherit',
        cwd: process.cwd(),
        windowsHide: true,
    });

    child.on('error', (error) => {
        console.error(error);
        process.exit(1);
    });

    child.on('close', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code ?? 1);
    });
}

if (fs.existsSync(markerPath) && fs.existsSync(nativeBinary)) {
    run(nativeBinary, args);
} else {
    run(process.execPath, [distEntry, ...args]);
}
