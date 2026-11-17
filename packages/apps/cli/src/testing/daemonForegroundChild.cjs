'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

// Stay up only while the spawning test process holds LUMPCODE_DAEMON_PARENT_SOCK.
// When that process dies the socket closes and this process exits. A stand-in
// whose parent is already gone exits immediately, instead of idling on a timer
// after init adopts it.

function parentGone(parentPid) {
    if (!Number.isInteger(parentPid) || parentPid <= 0) return true;
    if (process.ppid !== parentPid) return true;
    try {
        process.kill(parentPid, 0);
        return false;
    } catch (err) {
        return !err || err.code !== 'EPERM';
    }
}

function attachToParent(parentPid, sock) {
    if (parentGone(parentPid)) process.exit(0);

    const socket = net.connect({ path: sock });
    let connected = false;
    let finished = false;

    const retry = () => {
        if (finished) return;
        finished = true;
        socket.destroy();
        if (parentGone(parentPid)) process.exit(0);
        setTimeout(() => attachToParent(parentPid, sock), 50);
    };

    socket.on('connect', () => {
        connected = true;
        // This handle is the keepalive. Do not unref it.
        socket.ref();
    });
    socket.on('error', () => {
        if (connected) process.exit(0);
        else retry();
    });
    socket.on('close', () => {
        if (connected) process.exit(0);
        else retry();
    });
}

function beginParentWatch() {
    const parentPid = Number(process.env.LUMPCODE_DAEMON_PARENT_PID);
    const sock = process.env.LUMPCODE_DAEMON_PARENT_SOCK || '';
    if (!sock || parentGone(parentPid)) process.exit(0);
    attachToParent(parentPid, sock);
}

const stayOnly = process.env.LUMPCODE_DAEMON_STAY_ALIVE_ONLY === '1';
const projectRoot = process.env.LUMPCODE_DAEMON_PROJECT_ROOT;
const globalConfig = process.env.LUMPCODE_DAEMON_GLOBAL_CONFIG;
const cronSetup = process.env.LUMPCODE_DAEMON_CRON_SETUP || '*/5 * * * *';
const workspaceStrategy = process.env.LUMPCODE_DAEMON_WORKSPACE_STRATEGY || 'checkout';
const daemonId = (process.env.LUMPCODE_DAEMON_ID || 'global').trim() || 'global';
const includeRaw = process.env.LUMPCODE_DAEMON_INCLUDE || '';
const excludeRaw = process.env.LUMPCODE_DAEMON_EXCLUDE || '';

if (!stayOnly && (!projectRoot || !globalConfig)) {
    process.stderr.write('daemonForegroundChild: missing LUMPCODE_DAEMON_* env\n');
    process.exit(1);
}

beginParentWatch();

if (!stayOnly) {
    const projectJson = JSON.parse(
        fs.readFileSync(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf8'),
    );
    const projectName = projectJson.projectName;
    const base = `${projectName}.${daemonId}`;
    const daemonsDir = path.join(globalConfig, 'daemons');
    const pidFilePath = path.join(daemonsDir, `${base}.daemon.pid`);
    const metaFilePath = path.join(daemonsDir, `${base}.daemon.meta.json`);

    const include = includeRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const exclude = excludeRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    fs.mkdirSync(daemonsDir, { recursive: true });
    fs.writeFileSync(pidFilePath, String(process.pid), 'utf8');
    // Idle 0 distinguishes this overwrite from the parent stub (which omits the field).
    const metaPayload = {
        daemonId,
        cronSetup,
        workspaceStrategy,
        inFlightLumpCount: 0,
        ...(include.length ? { include } : {}),
        ...(exclude.length ? { exclude } : {}),
    };
    fs.writeFileSync(metaFilePath, `${JSON.stringify(metaPayload)}\n`, 'utf8');
}
