import { execSync } from 'node:child_process';

import { getGitCommitMessage, lumpBranchName as lumpBranchNameUtil } from '../../utils';
import { LUMP_BRANCH_PREFIX } from '../../consts';

/** Runs a git subcommand synchronously in `cwd` and returns trimmed stdout. */
export function git(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}

/** Returns whether `refs/heads/<branch>` exists in a bare remote repository. */
export function remoteHasBranch(input: { remoteDir: string; branch: string }): boolean {
    try {
        git(`show-ref --verify --quiet refs/heads/${input.branch}`, input.remoteDir);
        return true;
    } catch {
        return false;
    }
}

/** Default lump work-branch name for a single context (`lump/<lumpName>/<contextName>`). */
export function lumpBranchName(lumpName: string, contextName: string): string {
    return lumpBranchNameUtil({ lumpName, contextList: [{ name: contextName }] });
}

/** Asserts the lump context tracking commit message appears on the branch in the bare remote. */
export function expectLumpMarkerCommit(input: {
    remoteDir: string;
    lumpName: string;
    contextName: string;
}): void {
    const branch = lumpBranchName(input.lumpName, input.contextName);
    const message = getGitCommitMessage({ lumpName: input.lumpName, contextName: input.contextName });
    const subjects = git(`log ${branch} --format=%s`, input.remoteDir).split('\n').filter(Boolean);
    if (!subjects.includes(message)) {
        throw new Error(`Expected commit ${JSON.stringify(message)} on ${branch}`);
    }
}

/** Pushes a finished marker commit for a context onto `main` in the bare remote. */
export function seedFinishedContextOnMain(input: {
    projectRoot: string;
    lumpName: string;
    contextName: string;
}): void {
    const message = getGitCommitMessage({ lumpName: input.lumpName, contextName: input.contextName });
    git('checkout main', input.projectRoot);
    git(`commit --allow-empty -m "${message}"`, input.projectRoot);
    git('push origin main', input.projectRoot);
}

/** Creates and pushes an empty lump branch so concurrent-branch limits can be exercised. */
export function seedRemoteLumpBranch(input: {
    projectRoot: string;
    lumpName: string;
    contextName: string;
}): void {
    const branch = lumpBranchName(input.lumpName, input.contextName);
    git('checkout main', input.projectRoot);
    git(`checkout -b ${branch}`, input.projectRoot);
    git('commit --allow-empty -m "seed"', input.projectRoot);
    git(`push origin ${branch}`, input.projectRoot);
    git('checkout main', input.projectRoot);
}

/** Lists branch names under `lump/<lumpName>/` in a bare remote repository. */
export function listRemoteLumpBranches(remoteDir: string, lumpName: string): string[] {
    const prefix = `${LUMP_BRANCH_PREFIX}${lumpName}/`;
    const out = git(`for-each-ref --format='%(refname:short)' refs/heads/${prefix}`, remoteDir);
    return out ? out.split('\n').filter((b) => b.startsWith(prefix)) : [];
}

/** Repo-relative path of the e2e agent completion marker for a context. */
export function markerPathInRepo(lumpName: string, contextName: string): string {
    return `.lumpcode/e2e-markers/${lumpName}/${contextName}.done`;
}

/** Returns whether a file exists at the given path on a branch in a bare remote. */
export function remoteHasMarkerFile(input: {
    remoteDir: string;
    branch: string;
    markerPath: string;
}): boolean {
    try {
        git(`show ${input.branch}:${input.markerPath}`, input.remoteDir);
        return true;
    } catch {
        return false;
    }
}

/** Reads a file from a branch tip in a bare remote via `git show`. */
export function remoteBranchFileContent(input: {
    remoteDir: string;
    branch: string;
    filePath: string;
}): string {
    return git(`show ${input.branch}:${input.filePath}`, input.remoteDir);
}

/** Repo-relative path of the worktree-strategy probe file written by inline e2e commands. */
export function e2eWorktreeCwdProbePath(lumpName: string): string {
    return `.lumpcode/e2e-markers/${lumpName}/workspace-cwd.txt`;
}

/** Case-insensitive check that a cwd probe path is under `.lumpcode/worktrees` (Windows-safe). */
export function e2ePathIncludesWorktreeSegment(cwd: string): boolean {
    return cwd.replaceAll('\\', '/').toLowerCase().includes('.lumpcode/worktrees');
}
