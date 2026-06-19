#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const cliPkgJson = require.resolve('@lumpcode/cli/package.json');
const cliBin = path.join(path.dirname(cliPkgJson), 'bin/lumpcode.js');
const args = process.argv.slice(2);

const child = spawn(process.execPath, [cliBin, ...args], {
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
