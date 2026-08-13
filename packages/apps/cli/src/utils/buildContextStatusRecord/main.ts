import {
    execAsync,
    Failure,
    failure,
    GIT_LOG_HASH_BODY_FORMAT,
    parseGitLogHashBodyRecords,
    shellSingleQuote,
    Success,
    success,
} from "@lumpcode/core";
import { ContextStatusRecord } from "../../types";
import { globalConfigFolderPath as defaultGlobalConfigFolderPath } from "../../constants/globalConfigFolderPath";
import { contextNamesAfterLumpPrefix } from "../contextNamesAfterLumpPrefix";
import { getGitCommitMessage, getLumpCommitPrefixForLump } from "../getGitCommitMessage";
import { getContextStatuses } from "../getContextStatus";
import { makeLockedRefreshRemoteTrackingRefsFn } from "../makeLockedRefreshRemoteTrackingRefsFn";
import { LUMP_BRANCH_PREFIX } from "../../consts";

export async function buildContextStatusRecord(input: {
    projectRoot: string;
    lumpName: string;
    baseBranch: string;
}): Promise<Success<ContextStatusRecord> | Failure<string>> {
    const { projectRoot, lumpName, baseBranch } = input;

    const refreshRemoteTrackingRefsFn = makeLockedRefreshRemoteTrackingRefsFn({
        gitLock: {
            globalConfigFolderPath: defaultGlobalConfigFolderPath,
            gitCwd: projectRoot,
            lumpName,
            lockMode: 'wait',
        },
    });

    const fetchResult = await refreshRemoteTrackingRefsFn({ projectRoot });
    if (!fetchResult.success) {
        return failure(`Failed to fetch from remote: ${fetchResult.data}`);
    }

    const lumpPrefix = getLumpCommitPrefixForLump({ lumpName });

    const logResult = await execAsync(
        `git log --remotes=origin -F --grep=${shellSingleQuote(lumpPrefix)} --format=${shellSingleQuote(GIT_LOG_HASH_BODY_FORMAT)}`,
        { cwd: projectRoot },
    );
    if (!logResult.success) {
        return failure(`Failed to list lump commits: ${logResult.data.message}`);
    }

    const seen = new Set<string>();
    const matches: { hash: string; contextName: string }[] = [];

    for (const { hash, message } of parseGitLogHashBodyRecords(logResult.data.stdout)) {
        for (const contextName of contextNamesAfterLumpPrefix(message, lumpPrefix)) {
            if (seen.has(contextName)) continue;
            seen.add(contextName);
            matches.push({ hash, contextName });
        }
    }

    const statuses = await getContextStatuses({
        projectRoot,
        lumpName,
        baseBranch,
        contextNames: matches.map((m) => m.contextName),
        skipRefresh: true,
    });

    const record: ContextStatusRecord = {};

    for (const { hash, contextName } of matches) {
        const status = statuses.get(contextName) ?? 'toDo';

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
