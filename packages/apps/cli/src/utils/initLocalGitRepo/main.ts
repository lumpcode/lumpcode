import * as os from 'node:os';
import * as path from 'node:path';

import { execGit } from '../execGit';

/** Fixture git init must stay under `os.tmpdir()` so leftovers cannot be `git add`ed in this repo. */
export function assertPathIsUnderOsTmpdir(dir: string): void {
    const tmp = path.resolve(os.tmpdir());
    const resolved = path.resolve(dir);
    const rel = path.relative(tmp, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`refusing git init outside os.tmpdir(): ${dir}`);
    }
}

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
    assertPathIsUnderOsTmpdir(input.cwd);
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
