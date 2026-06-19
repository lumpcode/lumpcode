import { LUMP_BRANCH_PREFIX } from '../../consts';

export function lumpBranchGlob(input: { lumpName?: string } = {}): string {
    const { lumpName } = input;
    return lumpName ? `${LUMP_BRANCH_PREFIX}${lumpName}/*` : `${LUMP_BRANCH_PREFIX}*`;
}
