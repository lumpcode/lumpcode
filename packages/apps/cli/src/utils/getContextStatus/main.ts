import { getContextStatus as getContextStatusCore } from "@lumpcode/core";

import { makeGitCommitMessageFnFromLumpName } from "../makeGitCommitMessageFnFromLumpName";
import { ContextStatusRecordItem } from "../../types";

export async function getContextStatus(input: {
    projectRoot: string;
    contextName: string;
    lumpName: string;
    baseBranch: string;
}): Promise<ContextStatusRecordItem['status']> {
    const { projectRoot, contextName, lumpName, baseBranch } = input;

    return getContextStatusCore({
        contextName,
        gitCommitMessageFn: makeGitCommitMessageFnFromLumpName(lumpName),
        projectRoot,
        baseBranch,
    });
}
