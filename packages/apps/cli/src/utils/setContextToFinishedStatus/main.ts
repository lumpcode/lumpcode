import { execAsync, Failure, failure, shellSingleQuote, Success, success } from "@lumpcode/core";

import { getGitCommitMessage } from "../getGitCommitMessage";
import { getContextStatus } from "../getContextStatus";

export async function setContextToFinishedStatus(input: {
    projectRoot: string;
    contextName: string;
    lumpName: string;
    baseBranch: string;
}): Promise<Success<void> | Failure<string>> {
    const { projectRoot, contextName, lumpName, baseBranch } = input;

    const currentStatus = await getContextStatus({ contextName, projectRoot, lumpName, baseBranch });
    if (currentStatus === 'finished') {
        return success(undefined);
    }

    const remoteRef = `origin/${baseBranch}`;
    const tipResult = await execAsync(
        `git rev-parse --verify --quiet ${shellSingleQuote(remoteRef)}`,
        { cwd: projectRoot },
    );
    if (!tipResult.success) {
        return failure(`Remote branch "${remoteRef}" does not exist`);
    }
    const parent = tipResult.data.stdout.trim();

    const treeResult = await execAsync(
        `git rev-parse ${shellSingleQuote(`${parent}^{tree}`)}`,
        { cwd: projectRoot },
    );
    if (!treeResult.success) {
        return failure(`Failed to read tree of "${remoteRef}": ${treeResult.data.message}`);
    }
    const tree = treeResult.data.stdout.trim();

    const commitMessage = getGitCommitMessage({ contextName, lumpName });
    const commitResult = await execAsync(
        `git commit-tree ${shellSingleQuote(tree)} -p ${shellSingleQuote(parent)} -m ${shellSingleQuote(commitMessage)}`,
        { cwd: projectRoot },
    );
    if (!commitResult.success) {
        return failure(`Failed to create marker commit "${commitMessage}": ${commitResult.data.message}`);
    }
    const commitSha = commitResult.data.stdout.trim();
    if (commitSha.length === 0) {
        return failure(`Failed to create marker commit "${commitMessage}": empty commit id`);
    }

    const pushResult = await execAsync(
        `git push origin ${shellSingleQuote(`${commitSha}:refs/heads/${baseBranch}`)}`,
        { cwd: projectRoot },
    );
    if (!pushResult.success) {
        return failure(`Failed to push base branch "${baseBranch}": ${pushResult.data.message}`);
    }

    return success(undefined);
}
