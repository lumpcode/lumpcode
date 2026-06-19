import { LUMP_COMMIT_PREFIX } from "../../consts";

export function getGitCommitMessage(input: { contextName: string; lumpName: string }): string {
    const { contextName, lumpName } = input;
    return `${getLumpCommitPrefixForLump(input)}${contextName}`;
}

export function getLumpCommitPrefixForLump(input: { lumpName: string }): string {
    return `${LUMP_COMMIT_PREFIX}${input.lumpName} - `;
}
