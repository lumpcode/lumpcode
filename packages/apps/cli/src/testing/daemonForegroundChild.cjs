'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.env.LUMPCODE_DAEMON_PROJECT_ROOT;
const globalConfig = process.env.LUMPCODE_DAEMON_GLOBAL_CONFIG;
const cronSetup = process.env.LUMPCODE_DAEMON_CRON_SETUP || '*/5 * * * *';
const workspaceStrategy = process.env.LUMPCODE_DAEMON_WORKSPACE_STRATEGY || 'checkout';
const daemonIdEnv = process.env.LUMPCODE_DAEMON_ID || '';
const includeEnv = process.env.LUMPCODE_DAEMON_INCLUDE || '';
const excludeEnv = process.env.LUMPCODE_DAEMON_EXCLUDE || '';
const maxParallelRunEnv = process.env.LUMPCODE_DAEMON_MAX_PARALLEL_RUN || '';

if (!projectRoot || !globalConfig) {
    process.stderr.write('daemonForegroundChild: missing LUMPCODE_DAEMON_* env\n');
    process.exit(1);
}

const projectJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf8'),
);
const projectName = projectJson.projectName;
const daemonId = daemonIdEnv.trim() ? daemonIdEnv.trim() : 'global';
const base = `${projectName}.${daemonId}`;
const daemonsDir = path.join(globalConfig, 'daemons');
const pidFilePath = path.join(daemonsDir, `${base}.daemon.pid`);
const metaFilePath = path.join(daemonsDir, `${base}.daemon.meta.json`);

function parseList(raw) {
    if (!raw.trim()) return undefined;
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

const include = parseList(includeEnv);
const exclude = parseList(excludeEnv);
const maxParallelRun = maxParallelRunEnv.trim()
    ? Number.parseInt(maxParallelRunEnv.trim(), 10)
    : undefined;

fs.mkdirSync(daemonsDir, { recursive: true });
fs.writeFileSync(pidFilePath, String(process.pid), 'utf8');
const metaPayload = {
    daemonId,
    cronSetup,
    workspaceStrategy,
    ...(include !== undefined ? { include } : {}),
    ...(exclude !== undefined ? { exclude } : {}),
    ...(maxParallelRun !== undefined && !Number.isNaN(maxParallelRun)
        ? { maxParallelRun }
        : {}),
};
fs.writeFileSync(metaFilePath, `${JSON.stringify(metaPayload)}\n`, 'utf8');

setInterval(() => {}, 60_000);
