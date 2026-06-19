'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.env.LUMPCODE_DAEMON_PROJECT_ROOT;
const globalConfig = process.env.LUMPCODE_DAEMON_GLOBAL_CONFIG;
const cronSetup = process.env.LUMPCODE_DAEMON_CRON_SETUP || '*/5 * * * *';
const workspaceStrategy = process.env.LUMPCODE_DAEMON_WORKSPACE_STRATEGY || 'checkout';
const lumpNameEnv = process.env.LUMPCODE_DAEMON_LUMP_NAME || '';

if (!projectRoot || !globalConfig) {
    process.stderr.write('daemonForegroundChild: missing LUMPCODE_DAEMON_* env\n');
    process.exit(1);
}

const projectJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, '.lumpcode', 'project.json'), 'utf8'),
);
const projectName = projectJson.projectName;
const lumpName = lumpNameEnv.trim() ? lumpNameEnv.trim() : undefined;
const base = lumpName ? `${projectName}.${lumpName}` : projectName;
const daemonsDir = path.join(globalConfig, 'daemons');
const pidFilePath = path.join(daemonsDir, `${base}.daemon.pid`);
const metaFilePath = path.join(daemonsDir, `${base}.daemon.meta.json`);

fs.mkdirSync(daemonsDir, { recursive: true });
fs.writeFileSync(pidFilePath, String(process.pid), 'utf8');
const metaPayload = {
    cronSetup,
    workspaceStrategy,
    ...(lumpName !== undefined ? { lumpName } : {}),
};
fs.writeFileSync(metaFilePath, `${JSON.stringify(metaPayload)}\n`, 'utf8');

setInterval(() => {}, 60_000);
