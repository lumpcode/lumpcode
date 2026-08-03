'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const depth = Number.parseInt(process.env.LUMPCODE_TREE_CHILD_DEPTH || '0', 10);
const readyFile = process.env.LUMPCODE_TREE_READY_FILE || '';
const scriptPath = __filename;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReadyFile(filePath, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            await sleep(25);
        }
    }
    throw new Error(`Timed out waiting for tree ready file at ${filePath}`);
}

async function main() {
    const pids = [process.pid];

    if (depth > 0) {
        const childReadyFile = readyFile
            ? `${readyFile}.child-${depth}`
            : path.join(require('node:os').tmpdir(), `lump-tree-child-${process.pid}.ready`);

        const child = spawn(process.execPath, [scriptPath], {
            detached: true,
            stdio: 'ignore',
            env: {
                ...process.env,
                LUMPCODE_TREE_CHILD_DEPTH: String(depth - 1),
                LUMPCODE_TREE_READY_FILE: childReadyFile,
            },
        });
        child.unref();

        const childInfo = await waitForReadyFile(childReadyFile);
        if (Array.isArray(childInfo.pids)) {
            pids.push(...childInfo.pids);
        } else if (typeof childInfo.rootPid === 'number') {
            pids.push(childInfo.rootPid);
            if (Array.isArray(childInfo.childPids)) {
                pids.push(...childInfo.childPids);
            }
        }

        try {
            fs.unlinkSync(childReadyFile);
        } catch {
            // best effort
        }
    }

    if (readyFile) {
        fs.writeFileSync(readyFile, `${JSON.stringify({ pids })}\n`, 'utf8');
    }

    setInterval(() => {}, 60_000);
}

main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
});
