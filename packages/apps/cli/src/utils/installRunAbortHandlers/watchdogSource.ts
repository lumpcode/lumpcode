/**
 * Inline Node source for the run-abort watchdog child (`node -e <source> <parentPid> <graceMs>`).
 * Stays in the terminal process group so Ctrl+C reaches it even when the parent is stuck in a
 * sync busy-loop (parent JS SIGINT handlers never run in that case).
 */
export const RUN_ABORT_WATCHDOG_SOURCE = `
const parentPid = Number(process.argv[1]);
const graceMs = Number(process.argv[2]);
if (!Number.isFinite(parentPid) || parentPid <= 0) process.exit(1);
const waitMs = Number.isFinite(graceMs) && graceMs > 0 ? graceMs : 5000;

let killTimer;
function arm() {
  if (killTimer !== undefined) return;
  killTimer = setTimeout(() => {
    try { process.kill(parentPid, 'SIGKILL'); } catch {}
    process.exit(0);
  }, waitMs);
  killTimer.unref?.();
}
function disarmAndExit() {
  if (killTimer !== undefined) clearTimeout(killTimer);
  process.exit(0);
}

process.on('SIGINT', arm);
process.on('SIGTERM', arm);
process.stdin.resume();
process.stdin.on('end', disarmAndExit);
process.stdin.on('close', disarmAndExit);
process.stdout.write('ready\\n');
`.trim();

export function resolveNodeExecutableForWatchdog(): string {
    const base = process.execPath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
    if (base === 'node' || base === 'node.exe') {
        return process.execPath;
    }
    return process.platform === 'win32' ? 'node.exe' : 'node';
}
