import type { GitCommitMessageFn } from "@lumpcode/core";
import { getGitCommitMessage } from "../getGitCommitMessage/main";

export function makeGitCommitMessageFnFromLumpName(lumpName: string): GitCommitMessageFn {
    return ({ context }) => {
        const slashIndex = context.name.indexOf('/');
        if (slashIndex !== -1) {
            return getGitCommitMessage({
                lumpName: context.name.slice(0, slashIndex),
                contextName: context.name.slice(slashIndex + 1),
            });
        }
        return getGitCommitMessage({ contextName: context.name, lumpName });
    };
}
