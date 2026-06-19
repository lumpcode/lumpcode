import { execAsync, Failure, failure, shellSingleQuote, Success, success } from "@lumpcode/core";
import { ContextStatusRecord } from "../../types";
import { getContextStatus } from "../getContextStatus";
import { getGitCommitMessage, getLumpCommitPrefixForLump } from "../getGitCommitMessage";
import { LUMP_BRANCH_PREFIX } from "../../consts";

export async function buildContextStatusRecord(input: {
    projectRoot: string;
    lumpName: string;
    baseBranch: string;
}): Promise<Success<ContextStatusRecord> | Failure<string>> {
    const { projectRoot, lumpName, baseBranch } = input;

    const fetchResult = await execAsync(`git fetch --all`, { cwd: projectRoot });
    if (!fetchResult.success) {
        return failure(`Failed to fetch from remote: ${fetchResult.data.message}`);
    }

    const lumpPrefix = getLumpCommitPrefixForLump({ lumpName });

    const logResult = await execAsync(
        `git log --remotes=origin -F --grep=${shellSingleQuote(lumpPrefix)} --format=${shellSingleQuote('%H %s')}`,
        { cwd: projectRoot },
    );
    if (!logResult.success) {
        return failure(`Failed to list lump commits: ${logResult.data.message}`);
    }

    const seen = new Set<string>();
    const matches: { hash: string; contextName: string }[] = [];

    for (const line of logResult.data.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const sp = trimmed.indexOf(' ');
        if (sp === -1) continue;
        const hash = trimmed.slice(0, sp);
        const subject = trimmed.slice(sp + 1);
        if (!subject.startsWith(lumpPrefix)) continue;

        const contextName = subject.slice(lumpPrefix.length);
        if (seen.has(contextName)) continue;
        seen.add(contextName);
        matches.push({ hash, contextName });
    }

    const record: ContextStatusRecord = {};

    for (const { hash, contextName } of matches) {
        const status = await getContextStatus({ projectRoot, contextName, lumpName, baseBranch });

        const branchesResult = await execAsync(
            `git branch -r --contains ${hash} --format=${shellSingleQuote('%(refname:short)')}`,
            { cwd: projectRoot },
        );

        const remoteBranchPrefix = `origin/${LUMP_BRANCH_PREFIX}`;
        const branchName = branchesResult.success
            ? branchesResult.data.stdout
                .split('\n')
                .map((b: string) => b.trim())
                .filter((b: string) => b.startsWith(remoteBranchPrefix))
                .map((b: string) => b.slice('origin/'.length))[0] ?? ''
            : '';

        record[contextName] = {
            status,
            contextName,
            branchName,
            commitMessage: getGitCommitMessage({ contextName, lumpName }),
        };
    }

    return success(record);
}
