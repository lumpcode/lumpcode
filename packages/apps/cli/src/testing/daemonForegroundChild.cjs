'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The spawning test records its pid. When that process dies, this one is
// reparented and the pid no longer matches, so it exits instead of idling under init.
const PARENT_CHECK_MS = 1000;

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

function watchParent() {
    const parentPid = Number(process.env.LUMPCODE_DAEMON_PARENT_PID);
    if (parentGone(parentPid)) process.exit(0);
    setInterval(() => {
        if (parentGone(parentPid)) process.exit(0);
    }, PARENT_CHECK_MS);
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

watchParent();

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
