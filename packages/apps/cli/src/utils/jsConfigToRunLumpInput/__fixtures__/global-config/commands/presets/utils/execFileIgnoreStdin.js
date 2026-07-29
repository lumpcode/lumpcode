import { execFile } from 'node:child_process';

/**
 * Like `execFile`, but closes stdin immediately so agents that append piped
 * stdin (e.g. Codex `exec`) do not hang waiting for EOF.
 */
export function execFileIgnoreStdin(file, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile(file, args, options, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
        child.stdin?.end();
    });
}
