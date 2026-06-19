import { createHash } from 'node:crypto';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { Context } from '@lumpcode/core';

const MULTI_CONTEXT_BRANCH_HASH_LENGTH = 12;

export function contextListBranchSuffix(contextList: Pick<Context, 'name'>[]): string {
    if (contextList.length === 1) {
        return contextList[0].name;
    }
    const names = contextList.map((ctx) => ctx.name).sort();
    if (names.length === 0) {
        throw new Error('contextList must have at least one context');
    }
    const payload = names.join('\0');
    return createHash('sha256').update(payload).digest('hex').slice(0, MULTI_CONTEXT_BRANCH_HASH_LENGTH);
}

export function lumpBranchName(input: { lumpName: string; contextList: { name: string }[] }): string {
    const { lumpName, contextList } = input;
    const prefix = `${LUMP_BRANCH_PREFIX}${lumpName}/`;
    const suffix = contextListBranchSuffix(contextList);
    return `${prefix}${suffix || '1'}`;
}
