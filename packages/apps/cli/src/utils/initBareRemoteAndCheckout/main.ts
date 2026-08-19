import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';

/** Bare `origin` + local checkout with initial empty commit pushed to `origin/<branch>`. */
export function initBareRemoteAndCheckout(input: {
    projectRoot: string;
    remoteDir: string;
    /** Initial branch for local repo and `push -u`. Default: `'main'`. */
    branch?: string;
    /** Forwarded to `initLocalGitRepo`. Default: `'test@test.com'`. */
    userEmail?: string;
    /** Forwarded to `initLocalGitRepo`. Default: `'Test'`. */
    userName?: string;
    /** Forwarded to `initLocalGitRepo`. Default: `'init'`. */
    initialCommitMessage?: string;
}): void {
    const { projectRoot, remoteDir } = input;
    const branch = input.branch ?? 'main';
    execGit('init --bare', remoteDir);
    initLocalGitRepo({
        cwd: projectRoot,
        branch,
        userEmail: input.userEmail,
        userName: input.userName,
        initialCommitMessage: input.initialCommitMessage,
    });
    execGit(`remote add origin ${remoteDir}`, projectRoot);
    execGit(`push -u origin ${branch}`, projectRoot);
}
