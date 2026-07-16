import { execSync } from 'node:child_process';

/** Runs a git subcommand synchronously in `cwd` with piped stdout and returns trimmed stdout. */
export function execGit(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
}
