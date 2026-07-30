'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');

const readyFile = process.env.LUMPCODE_TREE_READY_FILE || '';

process.on('SIGTERM', () => {
    // Ignore SIGTERM so default stop times out without meta.busy.
});

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], {
    detached: true,
    stdio: 'ignore',
});
child.unref();

if (readyFile) {
    const payload = {
        pids: [process.pid, child.pid].filter((pid) => typeof pid === 'number'),
    };
    fs.writeFileSync(readyFile, `${JSON.stringify(payload)}\n`, 'utf8');
}

setInterval(() => {}, 60_000);
