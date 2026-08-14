import { execGit } from '../execGit';

/** `git commit -m …`, else `git commit --allow-empty -m …`. */
export function gitCommitOrAllowEmpty(input: { cwd: string; message: string }): void {
    const quoted = JSON.stringify(input.message);
    try {
        execGit(`commit -m ${quoted}`, input.cwd);
    } catch {
        execGit(`commit --allow-empty -m ${quoted}`, input.cwd);
    }
}

/** Optional `add -A`, commit-or-empty, push `origin/<branch>` (default `main`). */
export function gitCommitAllAndPush(input: {
    cwd: string; message: string; branch?: string; stageAll?: boolean; setUpstream?: boolean;
}): void {
    const { cwd, message, branch = 'main' } = input;
    if (input.stageAll !== false) execGit('add -A', cwd);
    gitCommitOrAllowEmpty({ cwd, message });
    execGit(input.setUpstream ? `push -u origin ${branch}` : `push origin ${branch}`, cwd);
}
