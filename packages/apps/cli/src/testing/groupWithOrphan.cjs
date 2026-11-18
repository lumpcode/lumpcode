/**
 * Builds a process group that holds an orphan: the leader starts a middle
 * process, which starts the orphan and exits, so the orphan is reparented out
 * of the leader's tree but stays in its group.
 *
 * Usage: node groupWithOrphan.cjs <leader-stay|leader-exit> <readyFile>
 * Writes `{ "leader": <pid>, "orphan": <pid> }` to readyFile once ready.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const [, , mode, readyFile] = process.argv;

if (mode === 'orphan') {
    setInterval(() => {}, 1_000_000);
} else if (mode === 'middle') {
    const orphan = spawn(process.execPath, [__filename, 'orphan'], { stdio: 'ignore' });
    orphan.unref();
    fs.writeFileSync(readyFile, String(orphan.pid));
    process.exit(0);
} else {
    const orphanFile = `${readyFile}.orphan`;
    const middle = spawn(process.execPath, [__filename, 'middle', orphanFile], { stdio: 'ignore' });
    middle.on('exit', () => {
        const orphan = Number(fs.readFileSync(orphanFile, 'utf8'));
        fs.writeFileSync(readyFile, JSON.stringify({ leader: process.pid, orphan }));
        if (mode === 'leader-exit') process.exit(0);
    });
    if (mode === 'leader-stay') setInterval(() => {}, 1_000_000);
}
