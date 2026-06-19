import { ContextStatus, Logger, LumpVariables } from "../../types";
import { GitCommitMessageFn } from "../../types/GitCommitMessageFn";
import { shellSingleQuote } from "../../utils";
import { execAsync } from "../execAsync";

export async function getContextStatus(params: {
    contextName: string;
    gitCommitMessageFn: GitCommitMessageFn;
    projectRoot: string;
    baseBranch: string;
    lumpVariables?: LumpVariables;
    contextVariables?: Record<string, string>;
    remoteName?: string;
    logger?: Logger;
}): Promise<ContextStatus> {
    const {
        contextName,
        gitCommitMessageFn,
        projectRoot,
        baseBranch,
        lumpVariables = {},
        contextVariables = {},
        remoteName = "origin",
        logger,
    } = params;

    const commitMessage = gitCommitMessageFn({
        context: { name: contextName, variables: contextVariables },
        lumpVariables,
        baseBranch,
    });

    const fetchAll = await execAsync(`git fetch --all --prune`, { cwd: projectRoot });
    if (!fetchAll.success) return 'toDo';

    const logResult = await execAsync(
        `git log --remotes=${remoteName} -F --grep=${shellSingleQuote(commitMessage)} --format=${shellSingleQuote('%H %s')}`,
        { cwd: projectRoot },
    );
    if (!logResult.success) return 'toDo';

    logger?.verbose(`logResult ${JSON.stringify(logResult.data)}`);

    const logResultOutput = logResult.data.stdout || logResult.data.stderr || '';

    const matchingHashes = logResultOutput
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => !!line)
        .map((line: string) => {
            const sp = line ? line.indexOf(' ') : -1;
            return {
                hash: sp === -1 ? line : line.slice(0, sp),
                subject: sp === -1 ? '' : line.slice(sp + 1),
            };
        })
        .filter((c: { subject: string }) => c.subject === commitMessage)
        .map((c: { hash: string }) => c.hash);

    logger?.verbose(`remoteName ${remoteName}`);
    logger?.verbose(`baseBranch ${baseBranch}`);
    logger?.verbose(`commitMessage ${commitMessage}`);
    logger?.verbose(`matchingHashes ${JSON.stringify(matchingHashes)}`);

    if (matchingHashes.length === 0) return 'toDo';

    const baseRef = `${remoteName}/${baseBranch}`;

    for (const hash of matchingHashes) {
        const isAncestor = await execAsync(
            `git merge-base --is-ancestor ${hash} ${baseRef}`,
            { cwd: projectRoot },
        );
        if (isAncestor.success) return 'finished';
    }

    for (const hash of matchingHashes) {
        const branches = await execAsync(
            `git branch -r --contains ${hash} --format=${shellSingleQuote('%(refname:short)')}`,
            { cwd: projectRoot },
        );
        if (!branches.success) continue;
        const branchList = branches.data.stdout
            .trim()
            .split('\n')
            .map((b: string) => b.trim())
            .filter((b: string) => b && b !== remoteName && b !== baseRef);
        if (branchList.length > 0) return 'branchPushed';
    }

    return 'toDo';
}
