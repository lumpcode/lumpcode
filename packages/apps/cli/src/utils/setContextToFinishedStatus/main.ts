import { execAsync, Failure, failure, Success, success } from "@lumpcode/core";

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

    const commitMessage = getGitCommitMessage({ contextName, lumpName });

    const switchResult = await execAsync(`git switch ${baseBranch}`, { cwd: projectRoot });
    if (!switchResult.success) {
        return failure(`Failed to switch to base branch "${baseBranch}": ${switchResult.data.message}`);
    }

    const commitResult = await execAsync(
        `git commit --allow-empty -m "${commitMessage}"`,
        { cwd: projectRoot },
    );
    if (!commitResult.success) {
        return failure(`Failed to create marker commit "${commitMessage}": ${commitResult.data.message}`);
    }

    const pushResult = await execAsync(`git push origin ${baseBranch}`, { cwd: projectRoot });
    if (!pushResult.success) {
        return failure(`Failed to push base branch "${baseBranch}": ${pushResult.data.message}`);
    }

    return success(undefined);
}

// setContextToFinishedStatus({
//     projectRoot: '.',
//     contextName: 'project-setup',
//     lumpName: 'cliCommands',
//     baseBranch: 'main',
// });