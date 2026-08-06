import { execGit } from '../execGit';

/** Bootstraps a commit-ready local git repo: `init -b`, user identity, empty initial commit. */
export function initLocalGitRepo(input: {
    cwd: string;
    /** Initial branch. Default: `'main'`. */
    branch?: string;
    /** Default: `'test@test.com'`. */
    userEmail?: string;
    /** Default: `'Test'`. */
    userName?: string;
    /** Initial commit message. Default: `'init'`. */
    initialCommitMessage?: string;
}): void {
    const cwd = input.cwd;
    const branch = input.branch ?? 'main';
    const userEmail = input.userEmail ?? 'test@test.com';
    const userName = input.userName ?? 'Test';
    const msg = input.initialCommitMessage ?? 'init';
    execGit(`init -b ${branch}`, cwd);
    execGit(`config user.email "${userEmail}"`, cwd);
    execGit(`config user.name "${userName}"`, cwd);
    execGit(`commit --allow-empty -m "${msg}"`, cwd);
}
